# MISSION
Add a new team role, "Social media manager" (SMM), plus a content-scheduling module to the existing Client Acquisition OS app. The founder hires an SMM, assigns them posts (which account, what to post, which day and time), sets recurring posting schedules, reviews and approves drafts, and tracks whether posts go out on time. The SMM sees their schedule, writes the posts, submits them for approval, publishes them manually on each platform, and marks them as posted with the live link.

Work autonomously from start to finish. Do not stop, pause or ask for confirmation. Follow the same rules as the original build:
- CLAUDE.md
- the autonomy rules and loop you used for M0–M9
- docs/PROGRESS.md as your memory

Report once at the end.

# 0. READ FIRST
CLAUDE.md, docs/PROGRESS.md, docs/01–08, and the current migrations and code. The existing app is complete and all tests pass. Keep it that way: every existing test must still pass at the end.

# 1. WRITE THE SPEC BEFORE CODING
Create docs/09-social-media.md from sections 2–8 below, in the same style as the other docs. Then update:
- docs/01 (roles, scope, glossary)
- docs/02 (new tables)
- docs/03 (permission matrix with a third column for SMM)
- docs/05 (social metrics)
- docs/07 (new screens and nav)
- docs/08 (add milestone M10 with its checklist)
- CLAUDE.md (mention docs/09)

Commit "docs: social media module spec". Then build M10.

# 2. ROLE AND ACCESS
- New role `social`, displayed as "Social media manager". Add it to `user_role` in its OWN migration file, because Postgres can't use a new enum value in the same transaction that adds it. In that same file, add `posts_published` to `task_metric` and `target_metric`.
- **Invite:** Team → Invite gets a Role field: BD (default) or Social media manager. The trigger still creates every new profile as `bd`; the invite server action then sets the role with the admin client, the same way it already sets niche and time zone. The founder can change BD ↔ SMM on Edit. The founder role can never change (the existing guard).
- **SMM access:**
  - Nav: My Day, Content, Tasks, Performance (their own social numbers only), Profile.
  - No access to Leads, Pipeline, Feed, Team or Settings. Middleware redirects to /my-day with the toast "That page isn't part of your role."
  - Database: add a `public.current_user_role()` helper (security definer, stable). Tighten `leads_insert` and `opportunities_insert` so only founder or bd can insert. Check that no other lead/activity/opportunity policy lets an SMM create data.
  - `metrics_scoreboard`, `metrics_daily` and the BD blocks on Performance must exclude SMMs. Change them in a new migration with `create or replace`; don't edit old migrations.
- Existing tasks work for SMMs unchanged: the founder can assign checklist tasks ("Design 5 carousel templates") and count tasks with the new metric `posts_published` (posts marked posted on that day in the SMM's time zone). Extend `count_task_progress` and `check_count_tasks` for it, and call the check when a post becomes posted.
- Targets grid: add a "Posts published" column. It only applies to SMMs; grey it out for BDs.

# 3. DATA MODEL (new migration)
**social_accounts:** the brand accounts the SMM posts to.
- id, name* (e.g. "BlueBugs LinkedIn page", "Zain personal LinkedIn")
- platform* enum: linkedin_page, linkedin_profile, instagram, facebook, x, tiktok, youtube, other
- profile_url
- audience_timezone* (IANA; default America/New_York; the time zone the audience lives in)
- is_active, sort_order, created_at
- Founder manages; everyone active can read.

**content_pillars:** a label list like niches, founder-managed, hide don't delete. Defaults: Case study, Tip or how-to, Behind the scenes, Offer, Industry news, Client result.

**posting_schedules:** recurring slots ("LinkedIn page, Mon/Wed/Fri, 9:00 AM New York time, assigned to Hina").
- id, account_id*, assignee_id*
- weekdays smallint[]* (ISO 1–7)
- local_time time*
- timezone* (defaults from the account's audience_timezone)
- pillar_id, default_format
- needs_approval bool (default true)
- draft_lead_hours int (default 24: the draft is due this many hours before posting time)
- starts_on*, ends_on
- is_active, created_by, created_at
- Founder only; the SMM can read their own.

**posts:** one row per post.
- id, account_id*, assignee_id*, created_by, schedule_id (null if one-off)
- title* (short topic, e.g. "How AI intake cuts missed calls")
- brief (the founder's instructions: goal, key message, CTA, reference links)
- pillar_id
- format enum: text, image, carousel, video, reel, story, article, poll
- campaign_id (optional link to an existing BD campaign)
- scheduled_at timestamptz (null only when status = idea); timezone (display time zone, copied from schedule or account)
- draft_due_at timestamptz (default scheduled_at − draft_lead_hours)
- needs_approval bool
- status enum: idea, planned, drafting, in_review, changes_requested, approved, posted, missed, cancelled
- SMM work fields: caption, hashtags, first_comment, cta_link, media_links text[] (Google Drive / Canva / Dropbox URLs; no file uploads in this version)
- posted_at, post_url (the live post link)
- Manual results: impressions, reactions, comments_count, shares, clicks, results_recorded_at
- created_at, updated_at
- Unique index on (schedule_id, scheduled_at) where schedule_id is not null.

**post_comments:** id, post_id, author_id, kind enum (comment, change_request, approval, status_note), body, created_at. This is the review conversation.

**post_status_events:** history. id, post_id, from_status, to_status, changed_by, changed_at. Written by trigger.

**feed_events:** extend the `kind` check with post_submitted, post_approved, changes_requested, post_published, post_missed. Write these from triggers, with summaries like "Hina submitted 'How AI intake cuts missed calls' for review".

# 4. RULES (enforce in SQL triggers/RLS; mirror in the UI)
**Status flow:**
- idea → planned (founder schedules it)
- planned → drafting (SMM starts)
- drafting → in_review (SMM submits; requires caption, or media_links for image/video formats)
- in_review → approved | changes_requested (founder only; a change request requires a comment of kind change_request)
- changes_requested → drafting or in_review (SMM)
- approved → posted (SMM)
- When needs_approval = false: drafting → posted is allowed directly.
- Any status → cancelled (founder only).
- missed → posted is allowed ("posted late").

**Who can do what:**
- Only the founder can create posts, except that an SMM can create `idea` posts assigned to themself (the "Suggest an idea" button).
- Only the founder can change account, assignee, scheduled_at, needs_approval, brief and title after creation.
- The SMM edits caption, hashtags, first_comment, cta_link, media_links and results, and moves status only along the flow above.
- The SMM cannot approve their own post.
- Editing the caption on an approved post moves it back to in_review (when needs_approval is true), with an automatic status_note comment.

**Posting:**
- **Mark as posted** requires post_url (validated as a URL). posted_at defaults to now and can be backdated up to 24h.
- On time = posted_at ≤ scheduled_at + 60 minutes. Otherwise late.

**Missed:**
- There are no background jobs in this version. Add an idempotent function `mark_missed_posts()` (security definer) that sets status = missed on posts whose scheduled_at + 2 hours has passed and whose status isn't posted, cancelled or idea. It writes a post_missed feed event once per post.
- The app calls it when these load: Content, My Day (founder and SMM), Performance, and Feed.

**Recurring schedules:**
- `ensure_post_slots(p_from date, p_to date)` (security definer, idempotent) creates `planned` posts for every active schedule on each matching weekday in the range, at local_time in the schedule's time zone. Convert correctly across DST.
  - Slot title: "<Account> post, <pillar or 'Open topic'>".
  - Copy pillar, default_format and needs_approval from the schedule; draft_due_at = scheduled_at − draft_lead_hours.
- Callers: the founder or the schedule's assignee. The Content page calls it for the visible range, capped at 28 days ahead.
- Editing a schedule changes future, untouched (planned) slots only. Deactivating a schedule cancels its future planned slots.

**Time zones:** always show both times: "Tue 30 Sep, 9:00 AM New York (6:00 PM your time)". Use lib/dates.ts; add helpers and DST tests (America/New_York in March and November).

**Character limits (warning only, never block):** a live counter in the caption editor, per platform: X 280, LinkedIn 3,000, Instagram 2,200, Facebook 63,206, TikTok 2,200, YouTube 5,000. Put these in one constants file with a comment to verify current limits. The counter turns amber at 90% and red above the limit.

# 5. SCREENS (follow docs/06 design system exactly)
**Content `/content`** (founder: all; SMM: own):
- Views: Week (default), Month, List.
- Filters: account, assignee (founder), status, pillar. Kept in the URL.
- **Week view:** 7 day columns. Posts appear as cards sorted by time, showing time (in the viewer's zone), a platform icon from lucide-react if available (else a short text chip like "LI"), title, status chip and assignee initials.
  - Founder only: drag a card to another day to reschedule it (keeps the local time) and click an empty day to create a post.
- **Status chip colors:** idea and planned are neutral; drafting uses the accent-soft; in review and changes requested use warn; approved uses the Meeting done chip style; posted is ok; missed is bad; cancelled is muted and struck through.
- **Month view:** a dot per post colored by status, with a day count.
- **List view:** a table with sorting.
- A "Needs review (n)" tab for the founder, with the same count shown as a badge on the Content nav item.
- Buttons:
  - Founder: **New post**, **Schedules**
  - SMM: **Suggest an idea**

**Post side panel:**
- **Brief section** (the founder edits; read-only for the SMM): account, scheduled date and time (entered in the account's audience time zone, with your-time shown under it), draft due, assignee, title, brief, pillar, format, campaign, needs approval.
- **Work section** (the SMM edits): caption with the character counter, hashtags, first comment, CTA link, and media links (add, remove, open).
- **Review thread:** comments, with kind badges.
- **Context action bar**, only showing actions that are valid now:
  - Start drafting, Submit for review, Approve, Request changes (opens a required comment), Mark as posted (asks for the post URL and time), Cancel post, Add results
- **Posted posts:** show the live link and the result fields. Nudge "Add results" 48h after posting.
- **Copy examples:** buttons "Submit for review", toast "Sent for review"; "Approve", toast "Post approved"; error "Add the live post link to mark it as posted."

**Schedules `/content/schedules`** (founder):
- Table of recurring rules.
- Side panel form: account, assignee, weekday toggles, time, time zone, pillar, format, needs approval, draft lead hours, start and end.
- The preview line reads: "Next 3 posts: Mon 29 Sep 9:00 AM New York (6:00 PM your time), …"
- **Stop schedule** cancels future planned slots, after a confirmation dialog.

**My Day:**
- **SMM My Day:**
  - "Today's posts": time in both zones, a countdown ("in 2h 10m"), status, and one primary action button. It gets an amber banner when a post is due within 60 minutes and isn't approved or ready, and a red banner when it's missed.
  - "Drafts due" (next 48h, not yet submitted), "Changes requested", the existing tasks block, and pace bars for the posts_published target.
- **Founder My Day:** add a "Needs your review" block (posts in_review, oldest first, with Approve/Request changes inline), and "Today's posts" across all accounts.

**Feed (founder):** a new event type filter "Social".

**Performance:**
- New tab "Social" (founder: all SMMs or one; SMM: self only).
- New metric function `social_metrics(p_from, p_to, p_user)`, security invoker. It returns per assignee:
  - planned (scheduled in range, not cancelled or idea), posted, on_time, late, missed
  - on-time rate
  - changes_requested count
  - median hours from first submit to approval
  - totals for impressions, reactions, comments, shares, clicks
- Blocks:
  - summary stat blocks
  - by account table
  - by pillar table with average reactions per post
  - a consistency grid of posted per day
  - list of missed posts
- Drill-down panels as usual.

**Settings (founder):** new tabs "Social accounts" and "Content pillars" (list pattern: add, rename, reorder, hide).

**Team:** the Role column and the invite Role field.

# 6. OUT OF SCOPE (do not build)
- Auto-publishing through platform APIs
- Connecting social accounts or OAuth
- Pulling analytics from platforms
- File uploads (links only)
- Browser, push or email notifications
- Multi-step or client approvals
- AI caption generation

Add these to "Out of scope" in docs/01 and docs/09.

# 7. TESTS (all must pass, plus every existing test)
**SQL** (extend supabase/tests and `pnpm db:test`):
- an SMM cannot insert leads or opportunities, and cannot read any lead
- an SMM cannot approve their own post, and cannot change scheduled_at or assignee
- posted requires post_url
- invalid status jumps are rejected
- `ensure_post_slots` is idempotent and puts 9:00 AM New York on the right UTC instant on both sides of the March and November DST changes
- `mark_missed_posts` marks once and writes one feed event
- a posts_published count task auto-completes
- `social_metrics` numbers are correct for a known fixture
- BD scoreboard rows exclude SMMs

**Unit:** dual-zone formatting, character counter thresholds, the status-action matrix (which buttons show for which role and status).

**E2E:**
1. The founder invites an SMM via the inbox link; the SMM lands on My Day and is blocked from /leads.
2. The founder creates a schedule; slots appear on the Content week view in the right place for both viewers.
3. SMM drafts → submits → founder requests changes with a comment → SMM resubmits → founder approves → SMM marks posted with a URL → the count task and Performance update, and feed events appear.
4. A post whose time has passed (set scheduled_at in the past via the admin client) shows as missed after the page loads, then can be marked as posted late.
5. The SMM suggests an idea; the founder schedules it.

Screenshot review of every new screen as founder and as SMM against docs/06, as in previous milestones.

# 8. DEMO DATA
Extend `pnpm seed:demo`:
- SMM "Hina" (Asia/Karachi)
- Accounts: "BlueBugs LinkedIn page" (linkedin_page, America/New_York) and "Zain personal LinkedIn" (linkedin_profile, America/New_York)
- Schedules: page Mon/Wed/Fri 9:00 AM, profile Tue/Thu 12:00 PM, both assigned to Hina
- About 15 posts across the last 2 weeks and the next 2 weeks, in every status, including 2 missed, 1 posted late, 2 in review and 1 with changes requested, plus results on the posted ones
- Hina's target: posts_published 5 per week
- One repeating count task: "Publish today's scheduled posts" (posts_published, 1, weekdays)

# 9. FINISH
Run the full verification (`pnpm lint && pnpm typecheck && pnpm test && pnpm db:test && pnpm test:e2e && pnpm build`), then `db reset` → `seed:demo` → screenshots. Update docs/PROGRESS.md (M10 checklist, decisions, deviations, known issues). Commit "M10: social media module". Then give the final report in the same format as before, adding:
- demo login for Hina
- the three URLs to try first as founder and as SMM