# 09 — Social media module

A third role, the **Social media manager (SMM)**, and a content-scheduling module. The founder hires an
SMM, assigns posts (which account, what to post, which day and time), sets recurring posting schedules,
reviews drafts and tracks whether posts go out on time. The SMM sees their schedule, writes the posts,
submits them for approval, publishes them by hand on each platform, and marks them as posted with the
live link.

Rules marked **(DB)** are enforced in SQL (migration `20260925000100_social_module.sql`); **(App)** rules
are built in TypeScript and mirror the database.

## 1. Role and access

- New role `social`, shown as **"Social media manager"**. It is added to `user_role` in its own migration
  (`20260925000000_social_enums.sql`), because Postgres can't use a new enum value in the transaction
  that adds it. The same file adds `posts_published` to `task_metric` and `target_metric`.
- **Invite:** Team → Invite has a **Role** field: BD (default) or Social media manager. The trigger still
  creates every new profile as `bd`; the invite server action then sets the role with the admin client,
  as it already does for niche and time zone. The founder can switch BD ↔ SMM in Edit. The founder role
  never changes (existing guard).
- **SMM navigation:** My Day, Content, Tasks, Performance (own social numbers only), Profile.
  - No Leads, Pipeline, Feed, Team or Settings. The proxy sends them to `/my-day` with the toast
    "That page isn't part of your role."
- **Database (DB):**
  - `public.current_user_role()` (security definer, stable).
  - `leads_insert` and `opportunities_insert` allow only founder or bd. Every other lead, contact,
    activity and opportunity policy already requires lead ownership (`can_access_lead`), which an SMM
    never has, so an SMM can't read or create sales data.
  - `metrics_scoreboard` and `metrics_daily` exclude SMMs (re-created in the new migration).
- **Tasks:** unchanged for SMMs. The founder can assign checklist tasks ("Design 5 carousel templates")
  and count tasks with the new metric **Posts published**: posts marked posted on that day in the SMM's
  time zone. `count_task_progress` and `check_count_tasks` handle it, and the check runs when a post
  becomes posted.
- **Targets:** a "Posts published" column, for SMMs only (greyed out for BDs; sales metrics are greyed
  out for SMMs).

## 2. Data model

### social_accounts
The brand accounts the SMM posts to. Founder manages; every active user can read.

| Field | Notes |
|---|---|
| name* | "BlueBugs LinkedIn page", "Zain personal LinkedIn" |
| platform* | linkedin_page, linkedin_profile, instagram, facebook, x, tiktok, youtube, other |
| profile_url | |
| audience_timezone* | IANA; default America/New_York; where the audience lives |
| is_active, sort_order, created_at | hide, don't delete |

### content_pillars
A label list like niches (add, rename, reorder, hide). Defaults: Case study, Tip or how-to, Behind the
scenes, Offer, Industry news, Client result.

### posting_schedules
Recurring slots, e.g. "LinkedIn page, Mon/Wed/Fri, 9:00 AM New York, assigned to Hina". Founder only;
the SMM can read their own.

| Field | Notes |
|---|---|
| account_id*, assignee_id* | |
| weekdays* | ISO 1–7 |
| local_time*, timezone* | timezone defaults from the account's audience_timezone |
| pillar_id, default_format | copied to each slot |
| needs_approval | default true |
| draft_lead_hours | default 24: draft is due this many hours before posting time |
| starts_on*, ends_on | |
| is_active, created_by, created_at | |

### posts
One row per post.

| Group | Fields |
|---|---|
| Assignment | account_id*, assignee_id*, created_by, schedule_id (null if one-off) |
| Brief (founder) | title*, brief, pillar_id, format, campaign_id, needs_approval |
| Timing | scheduled_at (null only for ideas), timezone (display zone), draft_due_at (default scheduled_at − draft lead hours) |
| Status | idea, planned, drafting, in_review, changes_requested, approved, posted, missed, cancelled |
| Work (SMM) | caption, hashtags, first_comment, cta_link, media_links[] (Drive / Canva / Dropbox links; no uploads) |
| Posting | posted_at, post_url |
| Results (manual) | impressions, reactions, comments_count, shares, clicks, results_recorded_at |

Formats: text, image, carousel, video, reel, story, article, poll. Unique `(schedule_id, scheduled_at)`
where schedule_id is set.

### post_comments
The review conversation: post_id, author_id, kind (comment, change_request, approval, status_note), body.

### post_status_events
History written by trigger: post_id, from_status, to_status, changed_by, changed_at.

### feed_events
New kinds: post_submitted, post_approved, changes_requested, post_published, post_missed, written by
triggers ("Hina submitted 'How AI intake cuts missed calls' for review").

## 3. Rules

### Status flow (DB)

| From | To | Who |
|---|---|---|
| idea | planned | founder (schedules it) |
| planned | drafting | assignee |
| drafting | in_review | assignee; needs a caption, or media links for image, carousel, video, reel |
| in_review | approved / changes_requested | founder only, never the assignee; a change request needs a `change_request` comment |
| changes_requested | drafting / in_review | assignee |
| approved | posted | assignee |
| drafting | posted | assignee, only when needs_approval is false |
| missed | posted | assignee ("posted late") |
| any | cancelled | founder |

The founder may also make any of the assignee's moves (to help out), except approving counts as the
founder's review.

### Who edits what (DB)
- Only the founder creates posts, except that an SMM may create `idea` posts assigned to themself
  (**Suggest an idea**).
- Only the founder changes account, assignee, scheduled time, needs approval, brief and title.
- The SMM edits caption, hashtags, first comment, CTA link, media links and results, and moves status
  along the flow above.
- Editing the caption of an approved post that needs approval moves it back to in_review with an
  automatic status note.

### Posting (DB)
- **Mark as posted** needs the live post URL. posted_at defaults to now and can be backdated up to 24h.
- **On time** = posted_at ≤ scheduled_at + 60 minutes. Otherwise late.

### Missed (DB)
- `mark_missed_posts()` (security definer, idempotent) sets `missed` on posts 2 hours past their
  scheduled time that aren't posted, cancelled or ideas, with one `post_missed` feed event per post.
- No background jobs: Content, My Day, Performance and Feed call it on load.

### Recurring schedules (DB)
- `ensure_post_slots(p_from, p_to)` (security definer, idempotent) creates `planned` posts for every
  active schedule on each matching weekday, at local_time in the schedule's time zone (DST-correct).
  - Title "<Account> post, <pillar or 'Open topic'>"; pillar, format and needs approval copied;
    draft_due_at = scheduled_at − draft lead hours.
  - Callers: the founder (all schedules) or an SMM (their own). Content calls it for the visible range,
    capped at 28 days ahead.
- Editing a schedule changes future, untouched (planned) slots only. Stopping a schedule cancels its
  future planned slots.

### Time zones (App)
Always show both: "Tue 30 Sep, 9:00 AM New York (6:00 PM your time)". Helpers live in `lib/dates.ts`.

### Character limits (App, warning only)
X 280, LinkedIn 3,000, Instagram 2,200, Facebook 63,206, TikTok 2,200, YouTube 5,000 (in
`lib/social.ts`; verify current limits). The counter turns amber at 90% and red above the limit.

## 4. Screens

### Content `/content` (founder: all; SMM: own)
- Views: **Week** (default), **Month**, **List**; founder adds **Needs review (n)**, with the count also
  on the Content nav item.
- Filters (in the URL): account, assignee (founder), status, pillar.
- Week: 7 day columns of cards sorted by time: time (viewer's zone), platform chip, title, status chip,
  assignee initials. Founder: drag to another day to reschedule (keeps the local time); click an empty
  day to create a post.
- Status chips: idea and planned neutral; drafting accent-soft; in review and changes requested warn;
  approved like Meeting done; posted ok; missed bad; cancelled muted and struck through.
- Month: a dot per post coloured by status, with a count per day. List: sortable table.
- Buttons: founder **New post**, **Schedules**; SMM **Suggest an idea**.

### Post side panel
- **Brief** (founder edits; read-only for the SMM): account, scheduled date and time (entered in the
  account's audience zone, your time shown under it), draft due, assignee, title, brief, pillar, format,
  campaign, needs approval.
- **Work** (SMM edits): caption with character counter, hashtags, first comment, CTA link, media links.
- **Review thread** with kind badges.
- **Action bar**, only valid actions: Start drafting, Submit for review, Approve, Request changes
  (required comment), Mark as posted (URL and time), Cancel post, Add results.
- Posted posts show the live link and result fields; "Add results" is nudged 48h after posting.
- Copy: "Submit for review" → "Sent for review"; "Approve" → "Post approved"; error "Add the live post
  link to mark it as posted."

### Schedules `/content/schedules` (founder)
Table of rules; side panel (account, assignee, weekdays, time, time zone, pillar, format, needs approval,
draft lead hours, start, end) with a preview "Next 3 posts: Mon 29 Sep 9:00 AM New York (6:00 PM your
time), …". **Stop schedule** asks first, then cancels future planned slots.

### My Day
- SMM: **Today's posts** (both times, countdown "in 2h 10m", status, one primary action; amber banner
  when due within 60 minutes and not approved or ready; red when missed), **Drafts due** (next 48h),
  **Changes requested**, the tasks block, and a pace bar for Posts published.
- Founder: adds **Needs your review** (oldest first, Approve / Request changes inline) and
  **Today's posts** across all accounts.

### Feed, Performance, Settings, Team
- Feed: event type **Social**.
- Performance: tab **Social** (founder: all SMMs or one; SMM: self only) from `social_metrics`:
  summary blocks, by account, by pillar (average reactions per post), posted-per-day grid, missed posts,
  drill-downs.
- Settings: tabs **Social accounts** and **Content pillars**.
- Team: Role column; Role field in Invite and Edit.

**Acceptance:**
- An SMM can't open Leads, Pipeline, Feed, Team or Settings, and the database refuses them sales data.
- A schedule's slots appear at the right time for both the founder and the SMM, across DST.
- Draft → submit → changes → resubmit → approve → posted works end to end, with feed events, the count
  task and Performance updating.
- A late post shows as missed after a page load and can still be posted late.

## 5. Metrics
`social_metrics(p_from, p_to, p_user?)` (security invoker), one row per assignee:

| Metric | Definition |
|---|---|
| Planned | posts scheduled in range, not idea or cancelled |
| Posted | of those, status posted |
| On time / Late | posted_at ≤ scheduled_at + 60 min / later |
| Missed | status missed |
| On-time rate | on time ÷ posted |
| Changes requested | change requests on posts in range |
| Median approval hours | first submit → approval |
| Impressions, reactions, comments, shares, clicks | totals of recorded results |

Sales metrics (`metrics_scoreboard`, `metrics_daily`) exclude SMMs.

## 6. Out of scope
Auto-publishing through platform APIs; connecting accounts or OAuth; pulling analytics from platforms;
file uploads (links only); browser, push or email notifications; multi-step or client approvals;
AI caption generation.

## 7. Tests
- SQL (`supabase/tests/03_social_test.sql`): SMM can't insert or read leads or opportunities; can't
  approve their own post or change scheduled time or assignee; posted needs a URL; invalid jumps
  rejected; `ensure_post_slots` idempotent and DST-correct (March and November, New York);
  `mark_missed_posts` marks once with one feed event; a Posts published count task completes;
  `social_metrics` fixture; scoreboard excludes SMMs.
- Unit: dual-zone formatting, counter thresholds, the status-action matrix.
- E2E: invite an SMM; schedule slots on the week view; the full review loop; missed then posted late;
  suggest an idea then schedule it.

## 8. Demo data
SMM Hina (Asia/Karachi); accounts "BlueBugs LinkedIn page" and "Zain personal LinkedIn" (New York);
schedules page Mon/Wed/Fri 9:00 AM and profile Tue/Thu 12:00 PM; about 15 posts over the last and
next two weeks in every status (2 missed, 1 posted late, 2 in review, 1 changes requested, results on
posted ones); target Posts published 5 per week; repeating count task "Publish today's scheduled posts".
