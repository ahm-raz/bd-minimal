# 05 — Metrics

Every number in the app comes from this page. One name means one definition, everywhere.

## 1. Counts

All counts are for a time range `[from, to)` (see docs/04, section 8) and are credited to one person.

| Metric | Definition | Credited to | Date used |
|---|---|---|---|
| Leads added | leads created | `created_by` (never moves on reassignment) | created_at |
| Outreach | activities with category `outreach` (first touch) | activity `user_id` | occurred_at |
| Follow-ups | activities with category `follow_up` | activity `user_id` | occurred_at |
| Replies | activities whose outcome is a reply (Interested, Not now, Not interested, Meeting booked) | activity `user_id` | occurred_at |
| Positive replies | outcome Interested or Meeting booked | activity `user_id` | occurred_at |
| Meetings booked | outcome Meeting booked | activity `user_id` | occurred_at |
| Meetings done | opportunities that entered Meeting done (counted once per opportunity per range) | opportunity owner at that moment | stage change time |
| Proposals sent | opportunities that entered Proposal sent (once per opportunity per range) | opportunity owner at that moment | stage change time |
| Won deals | opportunities in Won with won_at in range | opportunity owner | won_at |
| Won revenue | sum of `won_value` of those | same | won_at |
| New MRR | sum of `monthly_amount` for monthly won deals in range | same | won_at |
| Active MRR | sum of `monthly_amount` for monthly won deals not ended | owner | now (not range-based) |
| Avg completeness | average completeness of leads added in range | created_by | created_at |
| Flagged leads | lead-fix tasks created in range | assignee | created_at |

**Why meetings appear twice.** Meetings *booked* come from what BDs log. Meetings *done* come from the pipeline. The scoreboard shows both. The gap tells the founder how many booked calls didn't happen or weren't moved forward.

## 2. Rates

Shown as percentages with one decimal. If the denominator is 0, show "–", not 0%.

| Rate | Formula |
|---|---|
| Reply rate | Replies ÷ Outreach |
| Positive reply rate | Positive replies ÷ Outreach |
| Meeting rate | Meetings booked ÷ Outreach |
| Proposal rate | Proposals sent ÷ Meetings done |
| Win rate | Won deals ÷ (Won deals + Lost opportunities with lost_at in range) |

Rates use counts from the same range. They are not cohorts: a reply this week may belong to a message sent last week. This is a deliberate v1 simplification. Label the rate tooltips: "Replies this period ÷ first messages this period."

## 3. Targets

- Stored weekly per person per metric (leads added, outreach, follow-ups, replies, meetings booked, proposals sent). **Metrics are never added together.**
- **Daily target** = weekly ÷ 5, rounded to the nearest whole number. Shown on My Day.
- **Target for a range** = weekly ÷ 5 × number of weekdays (Mon–Fri) in the range, rounded. "This week" on Wednesday uses the full week (5 weekdays).
- **Achievement %** = actual ÷ range target.
- **Pace marker:** on progress bars for "Today" or "This week", show a thin marker where the person *should* be by now.
  - For a day: target × share of their working day elapsed. Working day is 09:00–18:00 in their time zone, clamped 0–1.
  - For a week: target × weekdays elapsed including today ÷ 5.
  - Color the bar green when at or ahead of pace, amber when behind by less than 20%, red when further behind.

Example: Ahmed's weekly leads target is 112, so his daily target is 22. On Wednesday at 13:30 his week bar shows 58/112, and the pace marker sits at 67 (112 × 3/5). He's 13% behind, so the bar is amber.

## 4. Pipeline (snapshot, not range-based)

| Metric | Definition |
|---|---|
| Open pipeline value | sum of estimated_value, open stages |
| Weighted pipeline | sum of estimated_value × stage probability, open stages |
| Count by stage | opportunities currently in each stage |
| Stuck deals | open and `stage_changed_at` older than 14 days |

Won and Lost columns on the board show only items that changed in the last 30 days, so the board stays short. A link reads "Show all".

## 5. Funnel (Performance page)

Six steps for the selected range and person: **Leads added → Outreach → Replies → Meetings booked → Proposals sent → Won deals.**

Each step shows its count and the conversion from the previous step. It's an activity funnel, not a cohort funnel (see Rates).

## 6. Consistency grid

Rows are people; columns are days in the range (max 31). Each cell shows the chosen metric: leads added (default), outreach, follow-ups, replies or meetings booked.

Cell shade compares the value to that person's daily target:
- 0 → empty
- below 50% → light
- 50–99% → medium
- 100% or more → full accent

Weekends are shown narrower and greyed.

## 7. Task metrics

For a range, per assignee: tasks due, done on time, done late, overdue now. Completion rate = done ÷ due, with the on-time share alongside.

## 8. Drill-down

Every number on Performance and My Day is clickable. It opens a side panel listing the rows behind it (leads, activities or opportunities) with links. Build these lists with regular table queries that use the same filters as the metric definition above.

## 9. Which function returns what

| Screen block | Function |
|---|---|
| Scoreboard, BD summary cards | `metrics_scoreboard(from, to)` + targets table |
| By niche / channel / campaign | `metrics_by_dimension(from, to, dimension, user?)` |
| Consistency grid | `metrics_daily(fromDate, toDate, viewerTz, user?)` |
| Pipeline health | `pipeline_summary(user?)`, `active_mrr(user?)` |
| Tasks block, My Day tasks | `tasks_with_progress(fromDate, toDate, assignee?)` |
| Today's counters on My Day | `metrics_scoreboard(todayStart, tomorrowStart)`, filtered to self |
| Win rate's lost count | direct query: opportunities with `lost_at` in range (RLS-scoped) |

Write one unit test per rate and target formula in `lib/metrics.ts`. Write a Playwright test that logs a known set of activities and checks the scoreboard numbers.

## 10. Social metrics (M10)

From `social_metrics(p_from, p_to, p_user?)`; definitions in `docs/09-social-media.md`, section 5.

| Metric | Definition |
|---|---|
| Planned | posts scheduled in range, not idea or cancelled |
| Posted / On time / Late | posted_at ≤ scheduled_at + 60 min is on time |
| Missed | status missed (2h past scheduled time, not posted) |
| On-time rate | on time ÷ posted |
| Changes requested | change requests on posts in range |
| Median approval hours | first submit → approval |
| Result totals | impressions, reactions, comments, shares, clicks (entered by hand) |
| Posts published (task / target metric) | posts marked posted on the day, in the SMM's time zone |

`metrics_scoreboard` and `metrics_daily` exclude SMMs, so sales numbers never include social staff.
