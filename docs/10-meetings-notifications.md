# 10 — Meetings, Google Calendar and notifications (M11)

This milestone adds three things:
- **Meetings as real records**, with an exact start time, duration, time zone, place or link, and reminders.
- **One-way sync to each person's own Google Calendar.**
- **A notification centre with two categories:**
  - **What's upcoming**: things due soon, computed live.
  - **What happened**: moves by other people that you should know about. These are stored per person and arrive live.

Where each rule lives:
- **(DB)** rules are enforced in SQL, in migrations `20260929000100_google_calendar.sql`, `20260929000200_meetings.sql` and `20260929000300_notifications.sql`.
- **(App)** rules are built in TypeScript.

The service-role key is **not** used anywhere in this milestone. Every Google call runs in the signed-in user's own request.

## 1. Meetings

### Why
Today "Meeting booked" is only an activity outcome. The only times recorded are when the BD logged it and a date-only next action. A calendar event needs the meeting's own time.

### meetings (DB)

| Field | Notes |
|---|---|
| lead_id* | cascade on delete |
| opportunity_id, contact_id | optional; contact is the primary contact by default |
| activity_id | the "Meeting booked" activity that created it |
| owner_id* | always the lead owner; follows reassignment |
| created_by* | default `auth.uid()` |
| title* | default "Meeting with Sarah Mitchell (Smile Dental Austin)" |
| starts_at* | UTC |
| duration_min* | 5–480; default 30 |
| timezone* | the IANA zone the time was entered in; default the lead's time zone, else the booker's |
| location | a video link or a place, up to 300 characters |
| agenda | up to 2000 characters |
| reminder_minutes | 0 to 5 values, each 0–40320 (Google's limits); default 30 and 10 |
| status* | scheduled, held, no_show, cancelled |
| status_note | cancel reason or no-show note |
| gcal_* | calendar sync state (section 2), written only by the server |

### Rules
- **Booking (App + DB):**
  - Logging an activity with outcome **Meeting booked** shows a required **Meeting** section: date and time, time zone, duration, location or link, reminders, and "Add to Google Calendar" when connected.
  - `book_meeting()` runs `log_activity()` and inserts the meeting in one transaction, so metrics are unchanged: Meetings booked still counts the activity by its `occurred_at` (docs/05).
- **Time bounds (DB):** `starts_at` must be from 1 day ago to 1 year ahead. When booking, the app also requires a future time.
- **Next action (DB):** booking sets the lead's next action to "Meeting with <contact>", due on the meeting's date in the owner's time zone. So it shows on My Day as a follow-up on that day.
- **Status changes (DB):**
  - scheduled → held, no_show or cancelled.
  - Any of those can go back to scheduled ("Undo").
  - Cancel needs a reason.
  - Only the owner or the founder can change a meeting.
- **Mark held (App):** opens Log activity as **Meeting held**. After saving, if the lead has one open deal that isn't past Meeting done, it offers "Move <deal> to Meeting done?".
- **Reassignment (DB):** future scheduled meetings move to the new owner with the lead. The old owner's calendar event is removed the next time they open the app (section 2).
- **Who sees meetings (DB):**
  - Same as the lead: `can_access_lead`.
  - The founder sees all.
  - An SMM sees none.
  - Only the founder can delete a meeting; everyone else cancels.

## 2. Google Calendar (one-way: app → Google)

- **Connect (App):** Profile → **Google Calendar** → **Connect Google Calendar**.
  - Google asks for the scope "See, create, change, and delete events on Google calendars you own" (`calendar.events.owned`) and the account email.
  - While the app is unverified, Google first shows "Google hasn't verified this app": click **Advanced**, then **Go to …**.
  - Each person connects their own calendar.
- **Feature flag:** the whole section is hidden unless the server env has `GOOGLE_CALENDAR=on`. Meetings and notifications work without it.
- **What goes to Google:**

  | Meeting field | Google event |
  |---|---|
  | title | summary |
  | starts_at, duration_min, timezone | start/end with the IANA zone, so it's correct across daylight-saving changes |
  | location | location |
  | agenda, contact name, email, phone, link to the lead | description |
  | reminder_minutes | popup reminders on the owner's calendar |
  | the app's meeting id | event id and private property, so a retry can never create a duplicate |

- **Changes (App):**
  - Reschedule or an edit updates the event.
  - Cancel deletes it.
  - Held and no-show keep it.
- **Invite the contact:** a checkbox, **off by default**, shown only when the contact has an email. When ticked, Google emails them an invitation.
- **Sync states** (chip on the meeting):

  | State | Chip | Meaning |
  |---|---|---|
  | off | Not in calendar | not connected, or "add to calendar" is off |
  | pending | Syncing… | waiting or retrying |
  | synced | In your calendar | up to date |
  | failed | Calendar failed · Retry | gave up after 8 tries or a permanent error |
  | removed_in_google | Removed from your calendar · Add again | the event was deleted in Google; the app doesn't recreate it on its own |

- **Retries (App):** the first try is right after saving. On a temporary error it retries with backoff (2, 4, 8… minutes, up to 6 hours, 8 tries). Retries run when the owner next loads any page; there's no background server.
- **Token expired or revoked:** the connection shows **Needs reconnect**. A banner on My Day and Profile says "Reconnect Google Calendar to keep adding meetings."
- **Disconnect:** revokes access at Google and stops syncing. Events already in the calendar stay there.
- **Security (DB + App):**
  - The refresh token is encrypted (AES-256-GCM, key only in the server env) and can't be selected by any user; only a function that returns the caller's own token can read it.
  - The access token is never stored.
  - The founder sees only each member's connection status (Team → Calendar column).
- **Not synced back:** edits made inside Google don't come back to the app.

## 3. Notifications

### Two categories
- **What's upcoming (App):** computed on request, never stored, so it's always current. Grouped **Overdue · Within the hour · Today · Next 7 days**.

  | Role | Items |
  |---|---|
  | BD | my meetings; follow-ups due (overdue, today, next 7 days); my tasks due; my open deals whose expected close date is within 7 days or has passed; my stuck deals (14+ days in stage) |
  | SMM | today's posts; drafts due in 48 hours; changes requested; my tasks due |
  | Founder | posts waiting for review; the team's meetings today; today's posts; my own follow-ups and deals if any; members with overdue tasks |

- **What happened (DB):** a `notifications` row per recipient, written by a trigger on `feed_events`. It never includes your own actions.

### Routing (DB)

| Event | Notified | Priority |
|---|---|---|
| Lead reassigned | new owner ("Zain gave you Smile Dental Austin"), old owner | normal |
| Lead flagged | lead owner | high |
| Task assigned (new task, or moved to you) | assignee | normal |
| Task completed | founder | normal |
| Deal created, stage moved | founder; deal owner if someone else did it | normal |
| Deal won, deal lost | founder; deal owner if someone else did it | high |
| Activity logged on your lead by someone else | lead owner | normal |
| Meeting booked | founder | normal |
| Meeting rescheduled or cancelled | owner if someone else did it; founder | normal |
| Post submitted for review | founder ("Needs your review") | high |
| Changes requested, post approved, post assigned, comment on a post | the post's SMM | normal (changes requested: high) |
| Post missed | founder and the post's SMM | high |

New feed kinds: `meeting_booked`, `meeting_rescheduled`, `meeting_cancelled`, `meeting_held`, `task_assigned`, `post_assigned`, `post_comment`. The founder's Feed shows them too, with a new **Meetings** filter.

### Rules
- **Groups** (for preferences): Meetings, Deals, Leads, Tasks, Social.
  - Each group has **In app** (on by default) and **Browser alerts** (off until you allow them).
  - Muting a group's In app setting stops new items being stored.
- **Read state (DB):** a user can only mark their own items read or delete them. Nothing else can be changed.
- **Duplicates (DB):** one notification per recipient per feed event.
- **Clean-up (DB):** read items older than 90 days and all items older than 180 days are deleted when their owner opens the app.

### Delivery (App)
- **Bell** at the top of the sidebar (and in the phone top bar). Its badge = unread "What happened" + "What's upcoming" items that are overdue or due within 24 hours.
- **Live:** new items arrive over Supabase Realtime, with no reload. High-priority items also show a toast.
- **Browser alerts:** only after the user clicks **Allow browser alerts** in Profile (the app never asks on its own), and only for groups they turned on. They show when the app tab is in the background.
- **Meeting reminders while the app is open:** at each reminder time, a toast and (if allowed) a browser alert: "Meeting with Sarah Mitchell in 10 min · Join". Each reminder fires once across open tabs.
- **When the app is closed:** Google Calendar's own reminders cover meetings. Everything else shows the next time the app opens. Web Push and email are out of scope (section 6).

## 4. Screens

### Log activity sheet
- Outcome **Meeting booked** adds a **Meeting** section:
  - **Date and time**, in the meeting's time zone, with the dual-zone line under it: "Tue 6 Oct, 10:00 AM Chicago (8:00 PM your time)".
  - **Time zone.**
  - **Duration** chips: 15 · 30 · 45 · 60 min.
  - **Location or link.**
  - **Reminders** chips: 10 min · 30 min · 1 hour · 1 day.
  - **Add to Google Calendar** (when connected).
  - **Invite <email>** (off).
- Error messages:
  - "Pick a date and time."
  - "Pick a time in the future."
  - "Pick a time zone from the list."
  - "Use a duration from 5 to 480 minutes."
  - "Keep the location under 300 characters."
  - "Pick up to 5 reminders."

### Lead page → Meetings panel (right column, above Opportunities)
- Rows: upcoming first, then past. Each shows the title, dual-zone time, duration, status chip, calendar chip, and **Join** when the location is a link.
- Row menu: **Reschedule**, **Mark held**, **No-show**, **Cancel meeting**, **Undo** (on held, no-show or cancelled).
- Empty: "No meetings yet. Log a Meeting booked outcome to add one."
- The timeline shows the "Meeting booked" activity as before; the meeting's later changes (moved, cancelled, held) live in the Meetings panel and the founder's Feed.

### My Day
- A **Meetings** block above Follow-ups, covering today and the next 7 days, with a countdown for today's.
- The founder's version shows the team's meetings today, with the BD's name.
- A Reconnect banner shows when the Google connection needs it.

### Bell popover
- Tabs: **What's upcoming** and **What happened**.
- What happened: newest first, with an unread dot, relative time, **Mark all as read**, and **See all**. Clicking an item opens it and marks it read.
- Empty states:
  - "Nothing coming up in the next 7 days."
  - "You're up to date."

### Notifications `/notifications` (all roles, shortcut G N)
- Full history, with filters for group and **Unread only**, and **Load more**.

### Profile
- **Notifications**: per-group In app and Browser alert toggles, **Allow browser alerts**, and default meeting reminders.
- **Google Calendar**: Connect or Disconnect, the connected email, status, and "Add booked meetings to my calendar".

### Team (founder)
- A **Calendar** column: Connected · Not connected · Needs reconnect.

## 5. Acceptance checks
- A BD books a meeting for Tue 6 Oct 10:00 AM America/Chicago, 30 min, reminders 30 and 10.
  - The lead shows it.
  - My Day lists it.
  - Google Calendar (connected) has it at 8:00 PM Asia/Karachi, with both popup reminders and the lead link.
  - Meetings booked went up by 1.
- Reschedule moves the Google event; Cancel removes it; the chip shows each state.
- A Google outage leaves the meeting saved with "Syncing…". It syncs after the next page load once Google is back.
- An expired token shows **Needs reconnect**; reconnecting resumes syncing.
- The founder reassigns a lead with a future meeting:
  - The new owner's bell shows it live.
  - The meeting moves to the new owner.
  - The old owner's event is removed on their next visit.
- Visibility:
  - A BD never sees another BD's meetings or notifications (RLS).
  - An SMM sees no meetings.
- Nobody gets a notification for their own action.
- Muting "Deals" stops new deal notifications for that user only.
- Browser alerts never show before the user clicks **Allow browser alerts**.

## 6. Out of scope (M11)
- Web Push when the app is closed.
- Email notifications and digests (these need a sending domain).
- SMS.
- Two-way calendar sync (reading changes from Google).
- Calendars other than Google.
- Shared team calendar.
- Meeting rooms.
- Recording or transcripts.
- Automatic Google Meet links. (Links are typed in; Meet creation may come later.)
