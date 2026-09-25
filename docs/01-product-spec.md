# 01 — Product spec

## 1. Purpose

Replace the "Client Acquisition OS" spreadsheet with a web app that:

1. Makes BDs record **detailed** leads every day: company, location, website, LinkedIn, emails, phones and decision makers.
2. Makes every piece of outreach a logged activity with an outcome, so reply and meeting numbers are real.
3. Lets the founder see work **as it happens**, assign daily tasks, and judge performance from several angles.
4. Keeps every number consistent. One definition per metric, filterable by date.

## 2. Users

| Role | Count | What they do |
|---|---|---|
| Founder | exactly 1 | Everything a BD does (own leads, Upwork, pipeline). Also manages the team, targets, settings and tasks, and sees all data. |
| BD | 1 to about 10 | Adds leads, logs activities, works their pipeline, completes tasks. Sees only their own work. |
| Social media manager (SMM) | 0 to a few | Writes and publishes the posts the founder schedules on the brand's social accounts, marks them as posted, and records results. Sees only their own posts and social numbers; no sales data. See `docs/09-social-media.md`. |

The SMM role was added in M10 (`docs/09-social-media.md`). There are no other roles.

Example team used across these docs:

| Name | Role | Niche | Time zone |
|---|---|---|---|
| Zain | Founder | All, Upwork | Asia/Karachi |
| Ahmed | BD | Dental | Asia/Karachi |
| Sara | BD | Law | Asia/Karachi |
| Bilal | BD | AI SaaS | Europe/Berlin |

## 3. Glossary

- **Lead**: one company a BD is pursuing, owned by one BD. It holds company details and one or more contacts. Two BDs may each have a lead for the same real company (duplicates are allowed).
- **Contact**: a person at the lead's company. One is marked primary.
- **Activity**: something a user did or received on a lead, like a LinkedIn message, email, call, reply received, meeting or proposal. Every activity has an outcome.
- **Outcome**: the result of an activity: No response, Bounced / wrong contact, Interested, Not now, Not interested, Meeting booked, or Done.
- **Next action**: a note plus a due date on the lead ("Send case study" on Wed). It drives follow-ups.
- **Opportunity**: real buying interest from a lead, tracked through stages. A won opportunity is a **deal**. There's no separate deal table.
- **Stage**: Qualified, Meeting done, Proposal sent, Negotiation, Won, Lost.
- **Task**: work the founder assigns to a person for a specific day.
  - A **count task** tracks itself ("Add 25 leads").
  - A **checklist task** is ticked by the BD.
  - A **lead fix** is created when the founder flags a lead.
- **Target**: a weekly number per person per metric ("Ahmed: 112 new leads per week").
- **Completeness**: a 0–100% score showing how fully a lead's details are filled in.

- **Post**: one piece of social content for one account, with a scheduled time, a status (idea → planned → drafting → in review → approved → posted, or missed / cancelled) and the live link once posted.
- **Posting schedule**: a recurring rule ("LinkedIn page, Mon/Wed/Fri 9:00 AM New York, Hina") that creates planned posts.
- **Content pillar**: a topic category for posts (Case study, Tip or how-to, …).
- **SMM**: Social media manager, the third role.

## 4. Scope

### In v1

1. Login, invites, two roles, deactivate and reactivate, per-user time zone
2. Settings: niches, channels, lead sources, lost reasons, activity types, outcome labels, stage labels and probabilities, campaigns, weekly targets
3. Leads with detailed company and contact information, several contacts per lead, completeness score, search and filters, reassignment
4. Activity logging with automatic lead status and a next action
5. My Day: tasks, overdue and due follow-ups, today's counters versus daily targets
6. Opportunities: pipeline board, won and lost forms, stage history
7. Tasks: count, checklist and lead fix; repeat on weekdays; progress and on-time tracking
8. Activity feed (founder only, live)
9. Performance: scoreboard, funnel, by niche, channel and campaign, daily consistency grid, pipeline health, task completion, all with a date range
10. Global search (Ctrl/Cmd + K)

11. (M10) Social media manager role and content scheduling: social accounts, content pillars, posting schedules, posts with a review flow, social metrics (`docs/09-social-media.md`)

### Out of scope for v1

Job Platform; importing data (CSV or spreadsheet); sending email or LinkedIn messages from the app; email or push reminders; payment-by-payment tracking and invoices; currencies other than USD; extra roles beyond the SMM added in M10; dark mode; mobile-optimised layouts (screens must still work on a phone, just not polished); file attachments; AI features; public API; audit log beyond the history tables; for the social module: auto-publishing through platform APIs, connecting social accounts or OAuth, pulling analytics from platforms, file uploads (links only), browser/push/email notifications, multi-step or client approvals, AI caption generation.

## 5. User stories and acceptance criteria

Each story lists the checks that prove it works. `docs/07-screens.md` has the screen-level details.

### Team and access
- **As the founder, I invite a BD by email** with name, niche and time zone.
  - They receive an invite email, set a password, and land on My Day.
  - Before the first login they show as "Invited".
- **As the founder, I deactivate a BD.**
  - They can no longer log in or load data.
  - Their past work still appears in reports under their name.
  - I'm prompted to reassign their open leads to someone else.
- **As any user, I set my own time zone.**
  - "Today", "overdue" and "this week" follow it.

### Leads
- **As a BD, I add a lead in under a minute** with at least company name, niche, channel, one contact's first name, and one way to reach them (email, phone or LinkedIn). For Upwork leads, an Upwork job URL counts as a way to reach them.
- **As a BD, I can fill in details** (website, company LinkedIn, address, Google rating, several contacts with job titles, decision-maker flag, emails, phones and LinkedIn URLs).
  - The completeness score updates as I type.
- **As a BD, I see a warning if I already have a lead** with the same website domain or company name.
  - I'm offered "Open existing lead" or "Add anyway".
  - Other BDs' leads are never checked or shown.
- **As a BD, I can't delete leads.** I can mark them Bad fit or Not interested. The founder can delete.
- **As the founder, I reassign** one lead, a selection, or all open leads of a person.
  - Open opportunities move with the lead.
  - History keeps who owned it when.

### Activities and follow-ups
- **As a BD, I log an activity from anywhere** (lead page, My Day row, or shortcut L) in three fields or fewer: type, outcome and next action. Notes are optional.
- **The lead's status updates itself** from what I log (rules in `docs/04`).
- **When I log "Meeting booked"**, the app offers to create an opportunity.
- **My Day shows follow-ups**: overdue first (red), then due today (amber). Each has one-click logging.

### Pipeline
- **As a BD, I drag opportunities between stages.** Every move is stored with a date.
- **Moving to Won asks for** final value, contract type (one-time or monthly) and monthly amount.
- **Moving to Lost asks for** a reason from the list and an optional note.
- **The founder sees everyone's board** and can filter by BD.

### Tasks
- **As the founder, I assign** a count task (metric + number + day, optional niche or campaign filter), a checklist task (title, optional linked lead or opportunity, note), or repeat either on weekdays.
- **Count tasks fill in automatically** and are marked done the moment the number is reached. BDs can't tick them.
- **Checklist tasks are ticked by the BD.** They can untick within the same day.
- **Flagging a lead** creates a lead-fix task for its owner with my note, due today.
- **Tasks not done by the end of their day** (in the assignee's time zone) show as overdue and stay visible until done or deleted.

### Feed and performance
- **As the founder, I see new events within about 2 seconds** without refreshing.
  - Filter by person and event type.
  - Clicking an event opens the lead.
- **As the founder, I pick a date range and optionally a BD** on Performance.
  - Every number on the page follows both.
  - Clicking a number shows the records behind it.
- **As a BD, I see my own Performance page**: my numbers versus my targets, and no one else's.

## 6. A normal week (reference story)

**Monday 09:00 PKT.** Zain opens Tasks and creates, for Ahmed, *"Add 25 dental leads (Texas)"*: count, leads added, 25, filter niche Dental, repeat on weekdays. For Sara he creates *"Send 15 connection requests from Law AI Intake"*: count, outreach, 15, filter campaign Law AI Intake.

**09:30.** Ahmed opens My Day and sees the task at 0/25, two overdue follow-ups and today's counters. He presses **N** and adds *Bright Smile Dental* (Austin, TX): website, Google Maps link, rating 4.7 (212 reviews). He adds the owner, *Dr. Maria Lopez* (LinkedIn, office phone, email, decision maker), and a second contact, *Jenna Ruiz*, office manager. Completeness shows 90%. He clicks *Save and add another*. The task shows 1/25.

**10:15.** Ahmed sends Dr. Lopez a LinkedIn connection request and logs it: *LinkedIn connection request*, *No response*, next action "Send DM" due Wednesday. The lead becomes **Contacted**.

**Wednesday.** The follow-up appears on Ahmed's My Day. He sends the DM and logs it.

**Thursday.** Dr. Lopez replies and agrees to a call. Ahmed logs *Reply received*, *Meeting booked*. The lead becomes **Replied**, and the app asks "Create opportunity?" He creates *"AI patient intake setup"*, $3,500. The lead becomes **Qualified** and a card appears on his board.

**All week.** Zain's Feed shows each step. He opens *Clinic Pro Dental*, which Ahmed added with the contact name "Front desk" and no email. He flags it: "Need the owner's name and direct email." Ahmed gets a lead-fix task due today.

**Next Tuesday.** After the call Ahmed drags the card to *Meeting done*, then Friday to *Proposal sent*. Two weeks later, to *Won*: $3,500 one-time plus $300/month support. The lead becomes **Customer**.

**Friday review.** Zain opens Performance, sets "This week", and sees:
- **Scoreboard:** Ahmed 118 leads added (target 112, 105%), 9 replies, 3 meetings booked. Sara 84 leads (75%), 14 replies, 5 meetings.
- **Consistency grid:** Sara added 0 leads on Monday and Tuesday and 60 on Friday.
- **By channel:** email reply rate for Law is 2%, LinkedIn is 9%.

He moves Sara's Law email campaign to Paused and gives her a daily outreach task instead.
