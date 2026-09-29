# 07 — Screens

Each screen lists who sees it, its layout, data, actions, states and acceptance checks. Layout sketches are rough; follow `docs/06-design-system.md` for visuals.

## Navigation

| Item | Route | BD | SMM | Founder |
|---|---|---|---|---|
| My Day | `/my-day` | ✓ | ✓ (social) | ✓ |
| Leads | `/leads` | own | – | all |
| Pipeline | `/pipeline` | own | – | all |
| Content | `/content` | – | own | all |
| Tasks | `/tasks` | own (read) | own (read) | assign and track |
| Feed | `/feed` | – | – | ✓ |
| Performance | `/performance` | own | own social | team |
| Team | `/team` | – | – | ✓ |
| Settings | `/settings` | – | – | ✓ |

Home after login: `/my-day`. Profile and Sign out are in the sidebar user menu.

---

## 1. Login `/login`, Accept invite `/accept-invite`, Reset password `/reset-password`

- **Login:** email, password, **Sign in**, "Forgot password?".
  - Wrong credentials: "Email or password is incorrect."
  - Deactivated user: "Your access has been turned off. Contact the founder."
- **Accept invite:** shows "Welcome, Ahmed. Set a password to start." Password (min 10 chars) + confirm → **Set password** → `/my-day`.
- **Reset password:** new password + confirm → **Update password**.
- **Setup `/setup`** (only when no profile exists): name, email, password, time zone → creates the founder.

**Acceptance:** an invited BD can set a password and reach My Day; a deactivated BD can't sign in; `/setup` returns 404 once any profile exists.

---

## 2. My Day `/my-day`

**Purpose:** the working list for today. It's the home page for everyone.

```
My Day                                         Thu 24 Sep   [+ Lead  N]
─────────────────────────────────────────────────────────────────────
Today so far
 Leads 12/22 ▓▓▓▓▓▓░░|░░   Outreach 9/15 ▓▓▓▓▓▓|░░   Follow-ups 6/20 ▓▓|░░░
 Replies 2   Meetings booked 1
─────────────────────────────────────────────────────────────────────
Tasks from Zain                                                 3 open
 ◻ Add 25 dental leads (Texas)          ▓▓▓▓▓░░░|░  12/25   Repeats
 ◻ Research Bright Smile before call     Bright Smile Dental   Due today
 ⚑ Fix lead: need owner's name           Clinic Pro Dental     Due today
─────────────────────────────────────────────────────────────────────
Follow-ups                                     Overdue 2   Today 5
 ● Dr. Patel  Riverside Family Dental  Send case study   Due yesterday [Log]
 ● ...
```

**Data:**
- Call `ensure_recurring_tasks(me, today)` on load.
- Then `tasks_with_progress(today-30, today, me)`: show tasks due today, plus overdue ones from earlier.
- Today's counters: `metrics_scoreboard` for today + targets.
- Follow-ups: my leads with `next_action_due <= today`, status not in (Customer, Lost, Not interested, Bad fit). Sort overdue first (oldest first), then today.

**Blocks:**
1. **Today so far.** Pace bars for each metric that has a target. Plain counts for replies and meetings. Clicking a number opens a drill-down.
2. **Tasks.**
   - Count tasks: pace bar and x/y, no checkbox.
   - Checklist and lead-fix tasks: checkbox, linked record and note (expand row).
   - Overdue tasks: red "Overdue since Tue".
   - Done tasks: collapse into "3 done today".
3. **Follow-ups.** Each row: contact name, company, next action, due label (red overdue / amber today), and a **Log** button that opens the Log activity sheet pre-filled for that lead. The row disappears after logging if the new due date is in the future.
4. **Coming up** (collapsed): next 7 days of follow-ups.

**Empty states:**
- No tasks: "No tasks from the founder today."
- No follow-ups: "Nothing due today. Open Leads and plan next steps for new leads."

**Acceptance:**
- A count task advances within 2 seconds of adding a matching lead.
- Logging from a follow-up row updates the row and counters without a full reload.
- A lead whose next action was due yesterday (in my time zone) shows as overdue.

---

## 3. Leads list `/leads`

```
Leads                          [Search…]  [Filters ▾]  [Saved views ▾]  [+ Lead]
┌─────────────────────────────────────────────────────────────────────────────┐
│☐ Company            Contact        Status     Niche   Next action     Due   Complete  Owner│
│☐ Bright Smile Dental Dr. M. Lopez   Replied    Dental  Send case study Wed   90%       AK   │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Columns:** company (plus city, state), primary contact (plus title), status chip, niche, channel, campaign, next action, due, completeness (bar + %), last activity, owner (founder only), created. Users can show or hide columns; the choice is saved in localStorage.
- **Search:** company, domain, contact name, email, phone, LinkedIn URL.
- **Filters:** status (multi), niche, channel, campaign, source, priority, owner (founder), due (overdue / today / this week / none), completeness (<50, 50–79, 80+), created date range, flagged, tags.
- **Built-in views:** My open leads (default), No next action, Overdue, Incomplete (<50%), Customers. Founder adds: All team leads, Flagged.
- **Bulk actions:**
  - BD: set status, set campaign, set priority, add tag
  - Founder: also Reassign and Delete
- **Row click** opens the lead page.

**Acceptance:** a BD never sees another BD's lead through search, filters or URL guessing (the lead page returns 404). Filters combine with AND. Filters are kept in the URL query string, so views can be shared.

---

## 4. Add or edit lead (side panel)

Opened with **+ Lead** or N from anywhere. The same form is used for editing.

**Quick add first.** The top of the panel holds only what's needed to start outreach (about 30 seconds to fill):

1. **Company:** company name*, website (duplicate check runs on blur), company LinkedIn URL
2. **Primary contact:** first name*, last name, job title, email, phone, LinkedIn URL
3. **Classification:** niche* (pre-filled with the BD's primary niche), channel*, lead source. Upwork job URL appears here when channel = Upwork (then it counts as a way to reach them).
4. **First step** ("Next action" when editing): next action + due date (quick chips). Optional; skipping it puts the lead in the "No next action" view.

**More details** (one section below; always starts closed, for new leads and edits):

- **Company details:** company phone, company email, company size, sub-niche (free text, e.g. "Pediatric dentistry")
- **<Contact>: more:** decision maker (toggle), email status, mobile, preferred channel, other social URL, secondary email
- **More contacts:** "+ Add contact" repeats all contact fields (max 10), with "Make primary" and "Remove"
- **Location:** address, city, state/region, country (default United States), lead time zone (suggested from state)
- **Online presence:** Google Maps URL, Google rating, review count
- **Campaign and tags:** campaign (filtered to the chosen niche, active only), priority, tags; owner (founder, edit only)
- **Sales context:** pain point ("What problem do they likely have?"), offer ("What we'd sell them"), notes

A completeness link or a validation error for a field under More details opens it and scrolls to the field. Details can be filled later from **Edit**; Leads → **Incomplete** lists leads that need them.

**Footer:**
- Live completeness meter; click **Completeness** to show or hide the missing-item links (hidden by default)
- **Save lead**, **Save and add another** (keeps niche, channel, campaign, source), **Cancel**

**Behavior:**
- Paste helpers: pasting a LinkedIn URL into the first-name field moves it to the LinkedIn field. Pasting a full "First Last" into first name splits it.
- Validation per docs/04, section 1.
- Duplicate notice per docs/04.
- Edit mode shows who created the lead and when, plus the current owner (founder can change it under Campaign and tags).

**Acceptance:**
- A lead with only name, niche, channel, first name and LinkedIn URL saves.
- A lead without any contact method does not save, and shows "Add at least one way to reach them: email, phone or LinkedIn."
- Phone "512 555 0100" with country US is stored as "+15125550100" and displayed "(512) 555-0100".
- Completeness matches the database value after saving.

---

## 5. Lead page `/leads/[id]`

```
← Leads
Bright Smile Dental   [Replied ▾]  [High]        Local time 9:14 AM     [Log activity L] [⋯]
Austin, TX   brightsmile.com   LinkedIn   ★ 4.7 (212)    Completeness 90% ▓▓▓▓▓▓▓▓▓░
──────────────────────────────────────────┬────────────────────────────────────
Next action: Send case study — Wed 30 Sep  │ Contacts                    [+ Add]
[Edit] [Done, log it]                      │ ★ Dr. Maria Lopez  Owner  DM
                                           │   maria@… (valid)  (512) 555-0100  in
Timeline                                   │ Jenna Ruiz  Office manager
 Thu 16:40  Reply received   Meeting booked│ ──────────────────────────────────
            "Happy to chat next Tue"   AK  │ Opportunities            [+ New]
 Wed 11:02  LinkedIn message   No response │ AI patient intake  $3,500  Qualified ▾
 Mon 10:15  LinkedIn connection request    │ ──────────────────────────────────
 Mon 09:48  Lead added by Ahmed            │ Details (niche, channel, campaign,
                                           │ source, pain point, offer, tags, notes)
                                           │ Ownership history (founder)
```

- **Header:**
  - status dropdown (manual change)
  - priority
  - lead local time
  - links open in a new tab (website, LinkedIn, Maps)
  - flag badge if an open lead-fix task exists
  - ⋯ menu: Edit, Flag lead (founder), Reassign (founder), Delete (founder)
- **Next action box:** edit inline. "Done, log it" opens Log activity.
- **Timeline:** activities, stage changes, owner changes and lead creation, newest first. Each activity shows the type, outcome chip, contact, notes and the user's initials. Filter chips: All / Activities / Pipeline.
- **Contacts:** click-to-copy email and phone; `mailto:` / `tel:` links; LinkedIn icon link.
- **Opportunities:** list with stage dropdown and value. Choosing Won or Lost opens its dialog.

**Acceptance:** everything logged elsewhere (My Day, pipeline) appears in the timeline in order. Founder actions are hidden from BDs, and the server rejects them anyway.

---

## 6. Log activity (side panel)

Fields and defaults per docs/04, section 3:
- Type (grouped by category)
- Outcome (filtered)
- Contact
- When
- Notes
- Next action + date chips, or "No next step"

**Save** → toast "Activity logged". Then, if relevant, the "Create opportunity?" or "Move to Proposal sent?" prompt.

**Acceptance:** the form never offers an outcome the database would reject. After saving, the lead's status and next action are updated wherever they're shown.

---

## 7. Pipeline `/pipeline`

- **Board** with columns Qualified, Meeting done, Proposal sent, Negotiation, Won, Lost.
  - Won and Lost show the last 30 days; "Show all" expands.
  - The column header shows the count and total value. Open columns also show the weighted value.
- **Top bar:**
  - founder: owner filter
  - niche filter
  - "Stuck only" toggle
  - total open value and weighted value
- **Card:** see docs/06. Clicking a card opens a side panel with opportunity details (title, value, expected close, notes, stage history), editable, plus a link to the lead.
- **Drag to Won** opens a dialog:
  - Final value* (defaults to the estimate)
  - Contract type* (One-time / Monthly)
  - Monthly amount (required if Monthly)
  - Buttons: **Mark as won** / **Cancel** (the card returns to its column)
- **Drag to Lost** opens a dialog: Reason*, Note. Buttons: **Mark as lost** / **Cancel**.
- **List view toggle:** a table of the same opportunities, for sorting by value or close date.

**Acceptance:**
- Dragging updates optimistically and persists.
- Cancelling Won or Lost returns the card.
- Stage history shows each move with date and user.

---

## 8. Tasks `/tasks`

**Founder view:**
- **Date picker** (default today). On load, call `ensure_recurring_tasks(member, date)` for every active member when the date is a weekday, so repeating tasks exist before they're listed.
- **Grouped by person:** name, then that day's tasks with progress and status.
  - Summary per person: "3 of 4 done".
  - Overdue tasks from earlier days appear under a "Still overdue" line.
- **New task (T) side panel:**
  - Assign to*
  - Kind (Count / Checklist)
  - Title* (auto-filled for count: "Add 25 leads")
  - For count: metric*, target*, niche filter, campaign filter
  - For checklist: linked lead or opportunity (search), note
  - Due date* (default today)
  - Repeat on weekdays (toggle)
  - "Start from a common task" menu (docs/04, section 6)
  - Buttons: **Assign task**
- **Repeating tasks tab:** list of templates with assignee, title and status. Edit changes future days; **Stop repeating**.
- **Row menu:** Edit, Delete.

**BD view:** read-only list: today, overdue, and the next 7 days. Checklist and lead-fix tasks can be ticked.

**Acceptance:**
- A repeating task appears for its assignee every weekday and never on weekends.
- A count task shows done at the moment its target is reached, with a feed event.
- A BD can't edit a task's title (the server rejects it).

---

## 9. Feed `/feed` (founder)

- A live list, newest first. Subscribe to Realtime inserts on `feed_events`.
- Each row: time, person avatar/initials, sentence ("Ahmed added lead Bright Smile Dental (Austin, TX)"), and a link to the record.
- **Filters:** person, event type (Leads added / Activities / Pipeline / Wins and losses / Tasks / Flags), and date range (default today).
- New rows fade in at the top with a "5 new" pill if the user has scrolled down.
- **Hover actions on lead rows:** Open, Flag lead.
- Infinite scroll, 50 at a time.

**Acceptance:** an event created by a BD appears on the founder's open feed within about 2 seconds without refreshing.

---

## 10. Performance `/performance`

**Top bar:** date range (default This week), person filter (founder: All / each person; BD: fixed to self), and for founders a "Compare to previous period" toggle that shows deltas.

**Blocks:**
1. **Summary line of stat blocks:** leads added, outreach, replies (+ reply rate), meetings booked, proposals sent, won revenue (+ deals), new MRR, active MRR.
2. **Scoreboard** (founder, All): one row per person with every count from docs/05, section 1, plus pace bars for metrics with targets, plus avg completeness and flagged leads. Sortable. Clicking a person sets the person filter.
3. **Funnel:** horizontal bars with conversion percentages between steps.
4. **Breakdown:** tabs By niche / By channel / By campaign. The table uses the columns from `metrics_by_dimension` plus rates. Recharts bar chart of reply rate per row.
5. **Consistency grid:** metric selector; people × days (docs/05, section 6).
6. **Pipeline health:** stages table (count, value, weighted), stuck deals list, active MRR.
7. **Tasks:** per person: due, done on time, late, overdue.

**Drill-down:** clicking any number opens a side panel with the underlying records.

**Acceptance:**
- Changing the range or person updates every block.
- Numbers match the SQL functions.
- A BD cannot see another person's numbers, even by editing the URL.

---

## 11. Team `/team` (founder)

- **Table:** name, email, role, niche, time zone, status (Active / Not signed in yet / Deactivated), open leads, last active (last activity time).
- **Add member (side panel):** full name*, email*, role*, primary niche* (BD only), time zone* (searchable; default Asia/Karachi), then **How they get in**:
  - **Set a password now** (default): password* + confirm*, min 10 characters. **Add member** → toast "ahmed@… added. They can sign in now."
  - **Send an invite email**: disabled with "Off until an email domain is set up." unless `EMAIL_INVITES=on`; the footer's **Send invite** button is disabled too.
  - Both offer "Set targets now" to jump to Settings → Targets for that person.
- **Row menu:**
  - Edit (name, role, niche, time zone)
  - Set password (not for the founder): new password + confirm → toast "New password set for Ahmed"
  - Resend invite (not signed in yet; disabled as "Resend invite (email off)" while email is off)
  - Reassign open leads
  - Deactivate / Reactivate
- **Deactivate dialog:** "Ahmed will lose access immediately. His past work stays in reports. He has 140 open leads." Buttons: **Deactivate and reassign leads** (opens a picker for the new owner) / **Deactivate only** / **Cancel**.

---

## 12. Settings `/settings` (founder)

Tabs:
- **Lists:** niches, channels, lead sources, lost reasons. Each is an editable list: add, rename inline, drag to reorder, and a Hide/Show toggle. Hidden items stay on old records and in reports.
- **Activity types:** name, category (select, with a help line explaining each category's effect on metrics), default channel, hide.
- **Outcomes and stages:** rename outcome labels; rename stages and set open-stage probabilities (0–100%). A note explains that meanings are fixed.
- **Campaigns:** table with name, niche, channel, owner, status, lead count, plus add and edit.
- **Targets:** a grid of people (rows) × metrics (columns) of weekly numbers. It saves on blur and shows the daily equivalent in small text under each cell.

---

## 13. Profile `/profile`

Full name, time zone (searchable IANA list, with the current local time shown), email (read-only), and a "Change password" link.

## 14. Command menu (Ctrl/Cmd+K)

- Search across own (or all, for the founder) leads, contacts and opportunities. Show up to 8 results per group.
- Actions: New lead, Log activity (asks for the lead), New task (founder), Go to page.

---

## 15. Social media screens (M10)

Full detail in `docs/09-social-media.md`, section 4.

- **Content `/content`**: Week (default), Month, List, and Needs review (founder). Filters in the URL.
  Founder drags cards to reschedule and clicks an empty day to create a post; SMM suggests ideas.
- **Post side panel**: Brief (founder), Work (SMM, caption counter), review thread, action bar with only
  the valid actions.
- **Schedules `/content/schedules`** (founder): recurring rules with a "Next 3 posts" preview.
- **My Day**: SMM gets Today's posts (both time zones, countdown, banners), Drafts due, Changes requested,
  tasks and a Posts published pace bar; the founder gets Needs your review and Today's posts.
- **Performance**: tab Social. **Feed**: filter Social. **Settings**: Social accounts, Content pillars.
  **Team**: Role column and field.
