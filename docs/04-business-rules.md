# 04 — Business rules

Rules marked **(DB)** are already in the migration; the app only has to respect them. Rules marked **(App)** must be built in TypeScript.

## 1. Lead entry: what a BD must record

The app's goal is detailed leads, so the form asks for a lot but requires only what makes a lead workable.

### Required to save (App, Zod)
| Field | Rule |
|---|---|
| Company name | 2–120 characters, trimmed |
| Niche | from list; pre-filled with the user's primary niche |
| Channel | from list |
| Primary contact first name | 1–60 characters |
| One way to reach them | at least one of: contact email, contact phone or mobile, contact LinkedIn URL, company phone, or (channel = Upwork) Upwork job URL |

### Validation and clean-up (App, before saving)
| Field | Clean-up | Valid when |
|---|---|---|
| Website | trim; add `https://` if missing; lowercase host | parses as URL with a dot in the host |
| Company LinkedIn | strip query string and trailing slash; force `https://www.linkedin.com/company/<slug>` | path starts with `/company/` or `/school/` |
| Contact LinkedIn | same; force `https://www.linkedin.com/in/<slug>` | path starts with `/in/` |
| Emails | trim, lowercase | standard email pattern |
| Phones | any format is accepted. If libphonenumber-js recognises it as valid for the lead country (US if blank), store E.164; otherwise keep it as typed | none (never blocks saving) |
| Google Maps URL | trim | host contains `google.` or `goo.gl` or `maps.app.goo.gl` |
| Upwork job URL | trim | host ends with `upwork.com` |
| Google rating | one decimal | 0.0–5.0 |
| Review count | integer | ≥ 0 |
| Tags | trim, lowercase, dedupe; max 10, 30 chars each | |
| Lead time zone | suggest from US state when set (TX → America/Chicago, CA → America/Los_Angeles, etc.); user can change | valid IANA name |

Show errors inline under each field. On save, keep the user's view and show a toast: "Lead saved".

### Duplicate warning (App)
While typing company name or website, check the user's own leads (RLS already limits the search) for:
- the same `domain`, or
- a case-insensitive exact company name match, or
- the same contact email or LinkedIn URL.

If found, show an inline notice: "You already have Bright Smile Dental (Contacted)." Offer **Open lead** or **Add anyway**. Never search or reveal other users' leads. Duplicates across BDs are allowed by design.

### Completeness score (DB)
Ten checks, 10 points each, recalculated automatically:

1. Website
2. Company LinkedIn
3. City **and** state/region
4. Pain point
5. Lead source
6. Primary contact job title
7. Primary contact LinkedIn
8. Primary contact email
9. Primary contact phone or mobile
10. At least one contact marked decision maker

In the form, show a live meter computed with the same rules in TypeScript (`lib/completeness.ts`, unit-tested to match the SQL). List the missing items under the meter as plain links that focus the field, e.g. "Add a job title".

Colors: under 50% red, 50–79% amber, 80% or more green.

## 2. Lead statuses

| Status | Meaning | Set by |
|---|---|---|
| New | Added, nothing done yet | default |
| Contacted | At least one outbound touch | DB, first non-reply activity on a New lead |
| Replied | They answered (any reply outcome except Not interested) | DB |
| Qualified | Has an open opportunity | DB, when an opportunity is created or moved to an open stage |
| Customer | Has a won opportunity | DB |
| Lost | Its only opportunity was lost | DB, when the last open opportunity is lost |
| Nurture | Not now; revisit later | BD by hand |
| Not interested | Said no | DB (outcome Not interested) or BD by hand |
| Bad fit | Wrong target | BD by hand |

The database never automatically overrides Qualified, Customer, Lost or Bad fit from an activity. A BD can always set any status by hand, and the next matching event may change it again.

## 3. Logging activities

- One form everywhere: **Type**, **Outcome** (only the outcomes allowed for that type's category), **Contact** (defaults to primary), **When** (defaults to now; can backdate up to 7 days), **Notes**, **Next action** (text + date).
- **Outcome defaults:**
  - outreach and follow-up types default to No response
  - Reply received defaults to Interested
  - Meeting held and Proposal sent default to Done
- **Next action is required** unless the user ticks "No next step" or the outcome is Not interested or Bounced. Quick date chips: Tomorrow, +3 days, +1 week, Pick date. Dates are the user's local dates.
- **When the outcome is Meeting booked** and the lead has no open opportunity, show a dialog after saving: "Create an opportunity for Bright Smile Dental?" with title and estimated value, and **Create** / **Not now** buttons.
- **Logging "Proposal sent"** on a lead with one open opportunity offers to move it to Proposal sent.
- **Editing and deleting:**
  - BDs can edit their own activities' notes, outcome and time for 24 hours, then they're locked (App).
  - Only the founder can delete activities (DB).

## 4. Opportunities

- Created from a lead: button on the lead page, or the dialog above. Title and estimated value are required; expected close date is optional.
- One lead can have several opportunities, but only one with the same title can be open at a time (App).
- **Moving stages:** drag on the board, or pick in the lead page's stage selector. Any stage can move to any stage, including backwards. Every move is recorded (DB).
- **Won** requires final value (defaults to the estimate), contract type, and monthly amount if monthly (DB enforces value and type).
- **Lost** requires a reason (DB).
- Moving a Won or Lost card back to an open stage asks for confirmation: "This will remove it from won revenue." Won or lost fields are cleared (DB).
- **Days in stage** = today − stage_changed_at. **Stuck** = open and in the same stage for 14+ days; shown with an amber clock icon.

## 5. Reassignment (founder)

- From a lead: *Owner* dropdown. From the leads list: select rows → *Reassign*. From Team: *Reassign open leads* (all leads not Customer, Lost, Not interested or Bad fit).
- Open opportunities move with the lead (DB). Won or lost ones stay with the original owner, so revenue credit doesn't move.
- Past activities keep their original user, so credit for past work doesn't move.
- The next action and its due date stay; the new owner sees them on My Day.

## 6. Tasks

### Kinds
| Kind | Created by | Completed by | Example |
|---|---|---|---|
| Count | founder | automatically when progress ≥ target | "Add 25 dental leads" |
| Checklist | founder | assignee ticks it | "Draft proposal for Hartman & Cole" |
| Lead fix | founder, via **Flag lead** | assignee ticks it after fixing | "Need owner's name, not front desk" |

### Count task metrics
| Metric | Counts (for the assignee, on the due date, in their time zone) |
|---|---|
| Leads added | leads they created |
| Outreach | activities in the outreach category |
| Follow-ups | activities in the follow_up category |
| Replies | activities with a reply outcome |
| Meetings booked | activities with outcome Meeting booked |

Optional filters: niche, campaign. Progress is live. Completion is permanent. If an activity is later deleted, the task stays done.

### Repeating
- "Repeat on weekdays" stores a template. Each weekday (Mon–Fri in the assignee's time zone), a task is created when the assignee opens My Day or the founder opens Tasks. The app calls `ensure_recurring_tasks` for the viewed date.
- No tasks on Saturday or Sunday.
- Stopping repetition deactivates the template. Already-created tasks stay.
- Editing a template changes future days only.

### Status
- **Done:** completed_at set. "On time" if completed on or before the due date in the assignee's time zone.
- **Overdue:** not done, and the due date is before the assignee's today.
- **Open:** otherwise.

Overdue tasks stay on My Day at the top until done or deleted by the founder.

### Suggested task library (Tasks → New task → "Start from a common task")
Pre-filled forms the founder can adjust:
1. Add N new leads (count, leads added), daily
2. Send N first-touch messages (count, outreach), daily
3. Follow up with N leads (count, follow-ups), daily
4. Book N meetings (count, meetings booked), weekly focus
5. Research a lead before a call (checklist, linked lead)
6. Prepare proposal (checklist, linked opportunity)
7. Clean up leads with no next action (checklist; the task page lists the user's open leads with no next action)
8. Update stuck deals (checklist; lists their opportunities stuck 14+ days)

## 7. Flag lead (founder)

On any lead: **Flag lead** → note (required). This creates a lead-fix task for the lead's owner, due today in their time zone, linked to the lead (DB writes a feed event). The lead shows a red flag badge until the task is done. The flag count per BD appears in Performance as a data-quality signal.

## 8. Time zones and dates

- Every user has a profile time zone. **Today**, **overdue**, **this week** and task due dates use the **viewer's** time zone. The one exception is task status, which uses the **assignee's** time zone, because a task belongs to them.
- **Weeks run Monday to Sunday.**
- **Date range presets** in the viewer's time zone:
  - Today, Yesterday, This week, Last week, This month, Last month
  - Last 7 days, Last 30 days
  - Custom (start and end dates, inclusive)
- **Converting a range for the database:** `[start 00:00 local, end+1 00:00 local)` → UTC timestamps → `p_from`, `p_to`. Put this in `lib/dates.ts`, used everywhere, with unit tests including a DST case (Europe/Berlin, last Sunday of March).
- **Showing times:** in the viewer's time zone.
  - Relative for recent items: "2 min ago", "Yesterday 16:40"
  - Absolute for older ones: "12 Sep, 16:40"
- **Lead local time:** when `lead_timezone` is set, the lead page shows "Local time 9:14 AM (Austin)". This helps BDs in Pakistan call US clinics during office hours.

## 9. Deleting things

| Item | BD | Founder |
|---|---|---|
| Lead | no; set Bad fit / Not interested | yes; cascades to its contacts, activities and opportunities; confirmation must type the company name |
| Contact | yes, unless it's the only one | yes |
| Activity | no | yes |
| Opportunity | no; move to Lost | yes |
| Task | no | yes |
| List item | – | hide only |
| Team member | – | deactivate only |

## 10. CSV lead import (M12)

**Who:** the founder, and BDs the founder allowed (docs/03). Always in two steps: **Check file**, then **Import**.

**File:** `.csv` (UTF-8, as saved by Excel's "CSV UTF-8" or Google Sheets), up to 2 MB and 2,000 rows. Excel files are refused with "save as CSV first". Quoted commas, quotes and line breaks, a BOM, and CRLF or LF all work.

**Columns** are matched ignoring case, spaces and punctuation, with common aliases ("Company", "Business" → Company name; "First Name", "first_name" → Contact first name). The preview lists every column and what it became.
- Unknown columns: not imported, with a warning.
- Two columns for the same field, or the same header twice: error.
- Plain "Name": error, rename it. Plain "Email" / "Phone" / "LinkedIn": the contact's when the file has a contact name column, otherwise the company's (stated in the preview).
- Status, Source, Next action: ignored with a warning (status is automatic; the source is CSV import).

**Rows:**
- **Missing column:** the field is empty, or the default picked on screen (niche, channel, owner), or United States / Medium.
- **Empty cell:** the same as a missing column.
- **Invalid value:** a row error naming the field (bad email, unknown niche, channel or campaign, priority, company size, country, over-long text).
- **Required:** company name (2–120 characters); niche and channel (column or default); a contact's first name whenever any contact detail is given. A row with no contact is allowed, with a warning.
- Values are never used to create list items: an unknown niche is an error, not a new niche.
- Cells starting like a spreadsheet formula (`=`, `@`, `+` or `-` then a letter) are refused. `+1 512…` phones are fine.
- Owner email (founder only) must be an active BD or the founder. A BD's imported leads are always their own.

**Duplicates** use the Add lead rule (section 1): same owner and the same website, company name, or contact email / LinkedIn. Checked inside the file (both rows reported) and against existing leads at Check file, and again inside the import.

**All or nothing:** any error blocks the whole file, and "Import failed. No leads were added." is shown with every problem by row and field (downloadable as a CSV). The import runs as one database transaction: if anything fails at any row, nothing is saved. A checked file must be imported within 30 minutes.

**Marking:** every imported lead has the source **CSV import** and its batch (code, file, who, when); the lead page shows "Imported: from prospects.csv (IMP-…)", and Leads can be filtered to one import. The feed gets one line per import, not one per lead, and the founder is notified of a BD's import.

**Metrics:** imported leads don't count toward Leads added, its targets, or count tasks (docs/05). Everything done with them afterwards (outreach, replies, deals) counts as usual.
