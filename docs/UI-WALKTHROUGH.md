# Client Acquisition OS: what's built and how to walk through it

This guide explains what the app does, how to open it, and how to click through every screen.
It follows the order a real week would: the founder sets things up, BDs add leads and log
outreach, deals move through the pipeline, and the founder reviews the numbers.

---

## 1. What was built

A small CRM for one founder and a team of business developers (BDs).

| Area | What it does |
|---|---|
| Sign-in and team | Founder setup, email invites, password reset, deactivate / reactivate people |
| Settings | Niches, channels, lead sources, lost reasons, activity types, outcome and stage labels, campaigns, weekly targets |
| Leads | Detailed lead form, completeness score, duplicate warning, list with search, filters and views, bulk actions, lead page |
| Activities | Log outreach, replies, calls, meetings and proposals; lead status updates by itself |
| My Day | Today's progress against targets, tasks, overdue and due follow-ups |
| Pipeline | Drag-and-drop board, Won / Lost dialogs, stage history, list view |
| Tasks | Count tasks that fill in by themselves, checklist tasks, "repeat on weekdays", flag lead |
| Feed | The founder's live stream of everything the team does |
| Performance | Scoreboard, funnel, breakdown by niche / channel / campaign, consistency grid, pipeline health, tasks |
| Polish | Ctrl/Cmd+K command menu, keyboard shortcuts, error and 404 pages, loading skeletons |

Security is enforced by the database: a BD can only ever see their own leads, opportunities,
tasks and numbers, even if they type another URL.

---

## 2. Start the app

Everything is already running on this computer. If you restarted it, run these in the project folder
(`D:\bd-minimal`):

```bash
pnpm db:start                         # local database (Docker Desktop must be running)
pnpm dev                              # the app
```

To start again from clean demo data:

```bash
pnpm db:reset && pnpm seed:demo
```

| What | Address |
|---|---|
| The app | http://localhost:3000 |
| Database viewer (Supabase Studio) | http://127.0.0.1:55423 |
| Email inbox for invites and password resets (Mailpit) | http://127.0.0.1:55424 |

### Demo logins

Every account uses the password **`demo-password-123`**.

| Email | Who | Time zone | What they have |
|---|---|---|---|
| zain@example.com | Zain, **founder** | Asia/Karachi | Sees everything; 6 Upwork leads of his own |
| ahmed@example.com | Ahmed, BD, Dental | Asia/Karachi | ~60 dental leads, one flagged lead, tasks |
| sara@example.com | Sara, BD, Law | Asia/Karachi | ~60 law leads, tasks |
| bilal@example.com | Bilal, BD, AI SaaS | Europe/Berlin | ~60 AI SaaS leads; shows time-zone handling |
| hina@example.com | Hina, **social media manager** | Asia/Karachi | Posts for two LinkedIn accounts (New York audience); no sales pages |

Tip: use one normal browser window for Zain and one private window for a BD, so you can
watch both sides at once (you'll need this for the live Feed).

---

## 3. A 20-minute guided tour

Follow these steps in order. Each one says where to click and what you should see.

### Step 1. Sign in as a BD (Ahmed) and look at My Day

1. Go to http://localhost:3000 and sign in as **ahmed@example.com**.
2. You land on **My Day**, the home page for everyone.
3. **Today so far**: bars for Leads, Outreach and Follow-ups against today's target.
   - The thin dark line on each bar is **where Ahmed should be by now**
     (based on a 09:00–18:00 working day in his time zone).
   - Green = on pace, amber = a little behind, red = well behind.
   - Click any number: a side panel lists the exact records behind it.
4. **Tasks from Zain**:
   - "Add 20 dental leads" is a **count task**. It has no checkbox; it fills in by itself as Ahmed adds leads.
   - The checklist task and the **Fix lead** task (red flag) have checkboxes.
5. **Follow-ups**: overdue ones first (red dot), then due today (amber).
   Each row has a **Log** button. **Coming up** (collapsed) shows the next 7 days.

### Step 2. Add a lead (keyboard shortcut N)

1. Press **N** anywhere (or click **+ Lead**). The **New lead** panel slides in from the right.
2. Type a company name. Niche is already filled in with Ahmed's niche (Dental).
3. In **Classification**, pick a **Channel**.
4. Under **Primary contact**, type a first name, then try saving without any contact details:
   you'll see *"Add at least one way to reach them: email, phone or LinkedIn."*
5. Add an email or a phone. Try the phone `512 555 0100`; it's saved as `+15125550100`.
6. Watch the **Completeness** bar at the bottom rise as you fill things in. The links under it
   ("Add a job title", "Add a pain point"…) jump to the missing field.
7. Things worth trying:
   - Paste `Maria Lopez` into **First name**: it splits into first and last name.
   - Paste a LinkedIn profile URL into **First name**: it moves to the LinkedIn field.
   - Type a company name Ahmed already has (for example **Bright Smile Dental**) and click into
     Website: *"You already have … (status)."* with **Open lead** / **Add anyway**.
     Other BDs' leads are never checked.
   - Type **TX** in State: the lead's time zone is suggested (America/Chicago).
8. Click **Save lead** (or **Save and add another**, which keeps niche, channel, campaign and source).

### Step 3. The Leads list

1. Click **Leads** in the sidebar (or press **G** then **L**).
2. Default view is **My open leads**. Open the view menu to see *No next action*, *Overdue*,
   *Incomplete (<50%)*, *Customers*, *All my leads* (closed leads included).
3. **Search** box (shortcut **/**): company, website, contact name, email, phone digits or LinkedIn.
4. **Filters**: status, niche, channel, campaign, source, priority, due, completeness, created dates,
   flagged, tags. Every filter is added to the page address, so you can copy the link and share the view.
5. **Columns**: hide or show columns; your choice is remembered.
6. Tick a few rows: the **bulk actions** bar lets a BD set status, campaign, priority or add a tag.

### Step 4. The lead page and logging an activity (shortcut L)

1. Click a company to open its page.
2. Header: status (click to change it by hand), priority, **local time** for the prospect
   ("Local time 9:14 AM (Austin)"), links to website / LinkedIn / Maps, and completeness.
3. **Next action** box: **Edit** it inline, or **Done, log it**.
4. Press **L** (or **Log activity**). Try this sequence and watch the status chip change:

   | Log this | Status becomes |
   |---|---|
   | LinkedIn connection request, No response | Contacted |
   | Reply received, Interested | Replied |
   | Reply received, **Meeting booked** | Replied, then the app asks **"Create an opportunity for …?"**. Create it and the status becomes **Qualified** |

   - The **Outcome** list only offers outcomes that make sense for the chosen type.
   - A **next action** is required unless you tick **No next step** (or the outcome is Not interested / Bounced).
   - **When** can be backdated up to 7 days, not more.
5. The **Timeline** shows every activity, stage change, owner change and the lead's creation.
   Use **All / Activities / Pipeline** to filter. A BD can edit their own activity for 24 hours.
6. **Contacts**: add contacts, **Make primary**, copy email or phone, click to call or email.
7. **Opportunities**: each has a stage dropdown; **+ New** creates one.

### Step 5. The Pipeline (drag and drop)

1. Go to **Pipeline** (**G** then **P**).
2. Six columns: Qualified, Meeting done, Proposal sent, Negotiation, Won, Lost.
   Each header shows the count, total value and (for open stages) the weighted value.
3. Drag a card to another open stage: it moves at once and is saved.
4. Drag a card to **Won**: a dialog asks for final value, contract type (One-time / Monthly)
   and monthly amount. Press **Cancel** and the card goes back.
5. Drag a card to **Lost**: a reason is required.
6. Cards show days in stage; an **amber clock** means stuck for 14+ days. **Stuck only** filters to those.
7. Click a card for its side panel: edit details and see the **stage history** with dates and who moved it.
8. **List** (top right) shows the same opportunities as a sortable table.

### Step 6. Switch to the founder (Zain)

Sign out (click your name at the bottom of the sidebar, then **Sign out**) and sign in as
**zain@example.com**. The sidebar now also shows **Feed**, **Team** and **Settings**.

### Step 7. Team

1. **Team** lists everyone with status **Active / Invited / Deactivated**, open leads and last activity.
2. **Invite member**: name, email, niche, time zone, then **Send invite**.
   - Open the email inbox (http://127.0.0.1:55424), click the invite link, set a password and you
     land on My Day as the new BD.
3. Row menu (**⋯**): Edit, Resend invite, Reassign open leads, Deactivate / Reactivate.
   Deactivating signs the person out and blocks them, and offers to reassign their leads.
   Their past work stays in the reports.

### Step 8. Settings

Five tabs:
- **Lists**: niches, channels, lead sources, lost reasons. Add, rename in place, drag to reorder,
  **Hide / Show**. Hidden items vanish from dropdowns but stay on old records.
- **Activity types**: name, category (with a note on what each category counts as), default channel.
- **Outcomes and stages**: rename labels; set the probability for each open stage (it drives the weighted pipeline).
- **Campaigns**: add and edit campaigns with niche, channel, owner and status.
- **Targets**: weekly numbers per person; saves when you leave the cell and shows "22 a day" underneath.

### Step 9. Tasks and flagging a lead

1. **Tasks** (press **T** anywhere to open **New task**).
2. **By day**: pick a date; tasks are grouped by person with "3 of 4 done". Overdue ones from
   earlier days appear under **Still overdue**.
3. **New task**:
   - **Count**: metric + target (title fills in, e.g. "Add 25 leads"), optional niche or campaign filter.
   - **Checklist**: optional linked lead or opportunity, note.
   - **Start from a common task** offers 8 ready-made tasks.
   - **Repeat on weekdays** creates it Monday to Friday only.
4. **Repeating tasks** tab: edit (future days only) or **Stop repeating**.
5. **Flag a lead**: open any lead as Zain, **⋯**, then **Flag lead**, and write what needs fixing. The owner gets a
   "Fix lead" task due today and the lead shows a red **Flagged** badge until they tick it.

A BD's Tasks page is read-only: today, overdue and the next 7 days; they can tick checklist and fix tasks.

### Step 10. The live Feed

1. As Zain, open **Feed**. The label next to the title changes from "Connecting" to **Live**.
2. In a private window, sign in as Ahmed and add a lead or log an activity.
3. Within about two seconds the event appears at the top of Zain's feed, with no refresh.
   If Zain has scrolled down, a **"1 new"** button appears instead.
4. Filter by person, event type (Leads added, Activities, Pipeline, Wins and losses, Tasks, Flags)
   and date. Hover a row for **Open** and **Flag lead**. Scroll down to load older events.

### Step 11. Performance

1. As Zain, open **Performance** (defaults to **This week**).
2. Top bar: date range, person (All or one person), **Compare to previous period**.
3. **Summary** blocks: leads added, outreach, replies (with reply rate), meetings booked,
   proposals sent (with proposal rate), won revenue (with deals and win rate), new MRR, active MRR.
4. **Scoreboard** (All): one row per person with every count, pace bars against targets,
   average completeness and flagged leads. Click a person's name to see only their numbers.
5. **Funnel**: Leads added → Outreach → Replies → Meetings booked → Proposals sent → Won, with the
   conversion between each step.
6. **Breakdown**: By niche / channel / campaign, with a reply-rate chart.
7. **Consistency**: people × days; darker = closer to the daily target; weekends are narrow and grey.
8. **Pipeline health**: stages with value and weighted value, stuck deals, active MRR.
9. **Tasks**: due, on time, late and overdue per person.
10. **Click any number** to see the records behind it.

Sign in as a BD and open Performance: the title reads **Your performance**, there's no person
picker and no scoreboard. Adding `?person=` with someone else's ID to the address changes nothing.

---

## 4. Keyboard shortcuts

| Key | Does |
|---|---|
| **N** | New lead |
| **L** | Log activity (on a lead page, or on the focused My Day follow-up row) |
| **T** | New task (founder) |
| **/** | Jump to lead search |
| **Ctrl/Cmd + K** | Command menu: search leads, contacts and opportunities; New lead, Log activity, New task, go to any page |
| **G** then **M** / **L** / **P** | Go to My Day / Leads / Pipeline |
| **Esc** | Close a panel (asks "Discard changes?" if you typed something) |

---

## 5. Things the app does by itself (worth noticing)

- **Lead status** changes from what's logged (New → Contacted → Replied → Qualified → Customer / Lost).
  It never overrides Qualified, Customer, Lost or Bad fit because of an activity.
- **Completeness** is recalculated whenever a lead or contact changes.
- **Count tasks** tick themselves the moment the number is reached, and post to the Feed.
- **Reassigning a lead** moves its open opportunities with it; won or lost ones stay credited to the original owner.
- **Time zones**: "today", "overdue" and "this week" follow each person's own time zone. Log in as Bilal
  (Berlin) to see dates that differ from Karachi late in the evening.
- **Numbers** on My Day and Performance all come from the database's metric functions, so every
  screen agrees.

---

## 6. What the tests prove

| Test suite | Covers |
|---|---|
| `pnpm test` (163 unit tests) | Dates and time zones (incl. Berlin daylight saving), money / percent / phone formats, every field clean-up rule, completeness matching the database on 10 leads, activity rules, metric formulas |
| `pnpm db:test` | The database's own security and business-rule checks |
| `pnpm test:e2e` (58 browser tests) | Setup, invites, deactivation, settings, leads, activities and statuses, My Day, pipeline, tasks, live feed, performance numbers, BD isolation, command menu, keyboard-only onboarding |
| `pnpm lighthouse` | Accessibility: My Day 100, Leads 100, Performance 100 |

Note: `pnpm db:test` and `pnpm test:e2e` wipe the database. Run `pnpm seed:demo` afterwards to get
the demo data back.

---

## 7. If something looks wrong

| Problem | Fix |
|---|---|
| Page doesn't load at all | Make sure Docker Desktop is running, then `pnpm db:start` and `pnpm dev` |
| "Email or password is incorrect" with demo logins | The data was wiped by tests: `pnpm db:reset && pnpm seed:demo` |
| Feed says "Connecting" for a long time | Refresh the page; if it persists, `pnpm db:stop` then `pnpm db:start` |
| Want a fresh empty app | `pnpm db:reset`, then open http://localhost:3000/setup to create the founder |

---

## 8. Where to read more

- `README.md`: setup, scripts and URLs
- `docs/PROGRESS.md`: every milestone checklist, decisions, deviations and known issues
- `docs/01`–`docs/08`: the original specification
- `screenshots/`: every page as founder and as BD
