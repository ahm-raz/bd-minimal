# 02 — Data model

The migration `supabase/migrations/20260924000000_init.sql` is the source of truth. This page explains it.

## 1. Map

```
profiles (team) ──< leads ──< contacts
                     │  └──< activities >── activity_types, outcomes
                     │  └──< opportunities ──< opportunity_stage_events
                     │  └──< lead_owner_events
profiles ──< tasks (optionally linked to a lead or opportunity)
profiles ──< task_templates (repeat on weekdays) ──> tasks
profiles ──< targets
settings lists: niches, channels, lead_sources, lost_reasons, activity_types, outcomes, stages, campaigns
feed_events: written by triggers; founder reads
```

## 2. Conventions

- Primary keys are UUIDs (history tables use bigint identity).
- All timestamps are `timestamptz` in UTC.
- `next_action_due` and `tasks.due_date` are plain **dates in the owner's or assignee's time zone**.
- Money is `numeric(12,2)` in USD.
- Phones are stored in E.164 format (`+15125550100`) and displayed nicely.
- Nothing that feeds a report is hard-deleted by BDs. Lists are hidden (`is_active = false`), never deleted.

## 3. Tables

### profiles
One row per team member, created automatically when an auth user is created.

| Field | Notes |
|---|---|
| id | = auth user id |
| email, full_name | |
| role | `founder` or `bd`. The first user ever created becomes founder; there can only be one. |
| primary_niche_id | Pre-fills the niche on new leads |
| timezone | IANA name, e.g. `Asia/Karachi`. Drives "today" for this user. |
| is_active, deactivated_at | Deactivated users can't read anything (RLS) and are banned in Auth |

### Settings lists
| Table | Editable by founder | Default values |
|---|---|---|
| niches | add, rename, reorder, hide | AI SaaS, Dental, Law, Agency Partnerships |
| channels | same | LinkedIn, Email, Upwork, Phone, Referral |
| lead_sources | same | Manual research, LinkedIn Sales Navigator, Apollo, Google Maps, Upwork job post, Referral, Inbound, Other |
| lost_reasons | same | Price, Went with someone else, No response, Not a fit, Timing, Other |
| activity_types | same, plus pick a **category** and default channel | see below |
| outcomes | **label only** | see below |
| stages | **label and probability only** | see below |
| campaigns | add, edit, set status (active/paused/completed) | none |

**Activity types and categories.** The category is what the metrics count; the name is just a label.

| Default type | Category | Default channel |
|---|---|---|
| LinkedIn connection request | outreach | LinkedIn |
| LinkedIn message | outreach | LinkedIn |
| Cold email | outreach | Email |
| Upwork proposal | outreach | Upwork |
| LinkedIn follow-up | follow_up | LinkedIn |
| Email follow-up | follow_up | Email |
| Upwork follow-up | follow_up | Upwork |
| Reply received | inbound_reply | lead's channel |
| Phone call | call | Phone |
| Meeting held | meeting | lead's channel |
| Proposal sent | proposal | lead's channel |
| Other | other | lead's channel |

**Outcomes.** Keys and flags are fixed; the label can be renamed. The last column limits which outcomes the log form offers for each category.

| key | Label | Reply | Positive | Meeting | Allowed for |
|---|---|---|---|---|---|
| no_response | No response | – | – | – | outreach, follow_up, call, proposal, other |
| bounced | Bounced / wrong contact | – | – | – | outreach, follow_up, call |
| interested | Interested | ✓ | ✓ | – | inbound_reply, call, meeting, proposal, other |
| not_now | Not now | ✓ | – | – | inbound_reply, call, meeting, proposal, other |
| not_interested | Not interested | ✓ | – | – | inbound_reply, call, meeting, proposal, other |
| meeting_booked | Meeting booked | ✓ | ✓ | ✓ | inbound_reply, call, other |
| done | Done | – | – | – | meeting, proposal, other |

"Done" is the neutral outcome for a meeting held or a proposal sent when nothing else applies.

**Stages.**

| key | Label | Probability | Open |
|---|---|---|---|
| qualified | Qualified | 20% | ✓ |
| meeting_done | Meeting done | 40% | ✓ |
| proposal_sent | Proposal sent | 60% | ✓ |
| negotiation | Negotiation | 75% | ✓ |
| won | Won | 100% | – |
| lost | Lost | 0% | – |

### campaigns
name (unique), niche, channel, owner (optional), status, notes. BDs pick a campaign on a lead (optional). Activities copy the lead's campaign automatically.

### targets
`(user_id, metric, weekly_value)`, one row per person per metric. Metrics: leads_added, outreach, follow_ups, replies, meetings_booked, proposals_sent. How targets become daily or range targets is in `docs/05-metrics.md`.

### leads
A company being pursued by one owner.

| Group | Fields |
|---|---|
| Ownership | owner_id (current owner), created_by (who added it; gets credit for "leads added" forever) |
| Company | company_name*, website, domain (auto from website), company_linkedin_url, company_phone, company_email, sub_niche, company_size (1-10, 11-50, 51-200, 201-500, 500+) |
| Location | address, city, state_region, country (default United States), lead_timezone (the prospect's local time zone) |
| Online presence | google_maps_url, google_rating (0–5), google_review_count, upwork_job_url |
| Classification | niche_id*, channel_id*, source_id, campaign_id, priority (high/medium/low), tags[] |
| Sales context | pain_point, offer, notes |
| Status | status (automatic, see docs/04), next_action, next_action_due |
| Derived | last_activity_at, completeness (0–100), created_at, updated_at |

`*` = required by the database. The app requires more; see docs/04, section 2.

### contacts
People at the lead's company. A lead has at least one (enforced by the app when creating the lead); exactly one can be primary.

first_name*, last_name, job_title, is_decision_maker, is_primary, email, email_status (unverified / valid / invalid / bounced), secondary_email, phone, mobile_phone, linkedin_url, other_social_url, preferred_channel_id, notes.

### activities
lead_id*, contact_id, opportunity_id, user_id (who did it; defaults to the caller), activity_type_id*, category (copied from the type), channel_id (defaults from the type, else the lead), campaign_id (defaults from the lead), outcome_key*, occurred_at (default now; can be backdated), notes.

Create activities with the RPC `log_activity(...)`. It inserts the activity and updates the lead's next action in one transaction.

### opportunities
lead_id*, owner_id (always the lead's owner), created_by, title* (the offer), stage_key, estimated_value, expected_close_date, stage_changed_at, notes.

- **Won fields:** won_value and contract_type (both required to enter Won), monthly_amount, won_at (auto), contract_ended_at (set by hand when a monthly contract stops).
- **Lost fields:** lost_reason_id (required to enter Lost), lost_note, lost_at (auto).

A lead can have several opportunities over time (a website job first, AI intake later).

### History tables (written by triggers, read-only)
- `opportunity_stage_events`: every stage change, with the owner at that moment. Meetings done and proposals sent are counted from here.
- `lead_owner_events`: every ownership change, including the first owner.
- `feed_events`: the live feed. kind, actor, subject_user (whose work it is), lead/opportunity/task links, summary.

### Tasks
- `task_templates`: repeat-on-weekdays definitions. Kind is count or checklist.
- `tasks`: one row per assignee per day.

| Field | Notes |
|---|---|
| kind | count, checklist or lead_fix |
| metric, target_count | count tasks only. Metrics: leads_added, outreach, follow_ups, replies, meetings_booked |
| filter_niche_id, filter_campaign_id | count tasks: only count matching work |
| due_date | the assignee's local date |
| lead_id, opportunity_id | optional links; lead_fix requires lead_id |
| completed_at | set automatically for count tasks, by the BD for the others |
| template_id | set when created from a template; unique per template and day |

## 4. Database functions the app calls

| Function | Use |
|---|---|
| `log_activity(p_lead_id, p_activity_type_id, p_outcome_key, p_occurred_at, p_contact_id, p_opportunity_id, p_notes, p_next_action, p_next_action_due, p_clear_next_action)` | Log activity and set or clear the next action |
| `ensure_recurring_tasks(p_user, p_day)` | Create a day's repeating tasks. Call when My Day or Tasks loads. Safe to repeat. |
| `tasks_with_progress(p_from, p_to, p_assignee?)` | Tasks with live progress and status (open / done / overdue) |
| `metrics_scoreboard(p_from, p_to)` | One row per person |
| `metrics_by_dimension(p_from, p_to, 'niche' \| 'channel' \| 'campaign', p_user?)` | Breakdown |
| `metrics_daily(p_from, p_to, p_tz, p_user?)` | Consistency grid |
| `pipeline_summary(p_user?, p_stuck_days?)` | Current pipeline by stage |
| `active_mrr(p_user?)` | Current monthly recurring revenue |

All of these respect RLS. A BD calling them gets only their own numbers.

## 5. Things handled automatically by triggers

- A profile is created on sign-up. The first user becomes founder.
- `domain` is derived from `website`.
- `completeness` is recalculated when lead or contact fields change.
- Lead status changes after each activity and opportunity change.
- Stage history, ownership history, and moving open opportunities with a reassigned lead.
- Won and lost timestamps, and clearing won fields when an opportunity is lost.
- Count tasks are marked complete when they reach their target.
- Feed events.

## 6. Social media module (M10)

Added by `20260925000000_social_enums.sql` (enum values) and `20260925000100_social_module.sql`.
Full field lists and rules are in `docs/09-social-media.md`, section 2.

| Table | Purpose |
|---|---|
| social_accounts | Brand accounts the SMM posts to: name, platform, profile URL, audience time zone, hide |
| content_pillars | Topic label list (hide, never delete) |
| posting_schedules | Recurring slots: account, assignee, weekdays, local time + time zone, pillar, format, needs approval, draft lead hours, start/end |
| posts | One post: brief (founder), work fields (SMM), status, scheduled/draft-due/posted times, live link, manual results |
| post_comments | Review thread: comment, change request, approval, status note |
| post_status_events | Every status change (trigger) |

- New role value `social` on `user_role`; new metric `posts_published` on `task_metric` and `target_metric`.
- `feed_events.kind` adds post_submitted, post_approved, changes_requested, post_published, post_missed.
- New functions: `current_user_role()`, `ensure_post_slots(p_from, p_to)`, `mark_missed_posts()`,
  `request_post_changes(p_post, p_body)`, `social_metrics(p_from, p_to, p_user?)`.
- `metrics_scoreboard` and `metrics_daily` now exclude SMMs; `count_task_progress` counts posts_published.

## 7. Meetings, notifications and Google Calendar (M11)

Added by `20260929000100_google_calendar.sql`, `20260929000200_meetings.sql` and `20260929000300_notifications.sql`.
Full field lists and rules are in `docs/10-meetings-notifications.md`.

| Table | Purpose |
|---|---|
| meetings | A booked meeting: lead, contact, exact start (UTC) + its time zone, duration, location or link, agenda, reminders, status (scheduled, held, no_show, cancelled) and Google sync state. Owner follows the lead. |
| notifications | "What happened" items, one row per recipient, written by a trigger on feed_events. Only `read_at` can change. |
| notification_prefs | Per user and group (meetings, deals, leads, tasks, social): in app on/off, browser alert on/off. |
| google_connections | One per user: Google email, calendar, encrypted refresh token (never selectable), status, auto-add. |
| calendar_cleanup | Calendar events the old owner's session must delete (after reassignment or lead deletion). |

Also: `profiles.meeting_reminders` (default reminders), `feed_events.meeting_id`, and new feed kinds `meeting_booked`, `meeting_rescheduled`, `meeting_cancelled`, `meeting_held`, `meeting_no_show`, `task_assigned`, `post_assigned`, `post_comment`.
Functions: `book_meeting`, `my_google_token`, `save_google_connection`, `mark_google_needs_reconnect`, `team_calendar_status`, `prune_my_notifications`.

## 8. CSV lead import (M12)

### profiles.can_import_leads
Boolean, default false. The founder turns it on per BD; only the founder can change it (`guard_profile_update`). `can_import_leads()` is true for the founder, or an active BD with the flag.

### lead_import_batches
One row per uploaded file: the audit log and the staging area.

| Column | Notes |
|---|---|
| `code` | `IMP-2026-00124`, from a sequence |
| `created_by`, `created_by_role` | who uploaded (role recorded from the profile) |
| `filename`, `file_sha256` | the file, to spot the same file imported twice |
| `default_owner_id` | owner for rows without an Owner email |
| `status` | `validated` → `imported`, `failed` or `cancelled` |
| `total_rows`, `valid_rows`, `invalid_rows`, `duplicate_rows`, `warning_count`, `imported_rows` | counts |
| `errors` (jsonb, first 200), `error_summary` | what was wrong |
| `rows` (jsonb) | the validated, normalised rows; cleared after import or failure |
| `expires_at` | 30 minutes after upload |

RLS: read your own (founder: all); insert only with `can_import_leads()`; updates only as allowed by `guard_import_batch_update` (validated → failed / cancelled by the owner; → imported only inside `import_lead_batch`). At most 10 uploads per person per 10 minutes.

### leads.import_batch_id
Null for leads added by hand. Imported leads also get the source **CSV import** (a hidden `lead_sources` row).

### Functions
- `import_conflicts(batch)`: rows that match an existing lead of the same owner (docs/04 section 10).
- `import_lead_batch(batch)`: the import. One transaction; returns the number of leads.
