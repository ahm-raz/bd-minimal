# 11 — Offices (M13–M18)

One app, many independent offices. Each office is a separate customer (an agency or company) with its own founder, staff and data. **No office can see, change or count anything from another office.**

Background and business reasons: `docs/SAAS-PLAN.md`. This page is the spec.

## 1. The rule every other doc now follows

Everything in docs 01–10 describes **one office**. Wherever they say "the founder", "the team", "everyone", "all leads", "all tasks", "the feed" or "the settings", read **"in the same office"**.

- The founder of office A is a founder only in office A.
- A BD's "own" data is also, by definition, in their office.
- Metrics, search, the feed, notifications, realtime and CSV import never cross offices.

## 2. Words

| Word | Meaning |
|---|---|
| **Office** | One customer. Has a name, a default time zone, a status and a seat limit. Everything else belongs to exactly one office. |
| **Member** | A profile in an office: its founder, a BD or an SMM. A person (email) belongs to **one** office only. |
| **Platform admin** | You, the app's owner. Creates offices, suspends and reactivates them, changes seat limits. **Cannot see any office's data** (leads, contacts, activities, deals, posts, tasks, feed, notifications, metrics), only the office list in section 6. A platform admin is also a normal member of their own office. |

## 3. Data model changes

### offices (new)
| Field | Notes |
|---|---|
| id | uuid |
| name | required, 1–80 characters. Shown in the sidebar and in invite emails. Not unique (two offices may share a name). |
| timezone | IANA name. Default time zone for new members of this office (replaces the hard-coded `Asia/Karachi`). |
| status | `active` or `suspended` |
| seat_limit | int, null = no limit. Counts **active** members, founder included. |
| suspended_at, created_at, updated_at | |

### platform_admins (new)
`user_id` (primary key, references profiles). Changed by SQL only; there's no screen for it. The migration makes the existing founder a platform admin.

### pending_members (new)
A reservation made **before** an auth user is created, so the sign-up trigger knows which office and role the new person joins. Invite calls can't carry trusted data, so this table is how the office is passed.

| Field | Notes |
|---|---|
| email | primary key, stored lower-case |
| office_id | the office the person joins |
| role | `founder`, `bd` or `social` |
| created_by, created_at | |

- Founders can insert and delete rows for their own office, with role `bd` or `social` only. Platform admins create `founder` rows through `create_office`.
- The sign-up trigger reads the row and deletes it.

### office_id on every business table
Every table except `offices`, `platform_admins` and `pending_members` gets `office_id uuid not null default current_office_id() references offices`. That covers:
- `profiles`
- the settings lists: niches, channels, lead_sources, lost_reasons, activity_types, outcomes, stages, campaigns, content_pillars, social_accounts
- the working tables: targets, leads, contacts, activities, opportunities, the history tables, tasks, task_templates, feed_events, posts, post_comments, post_status_events, posting_schedules, meetings, notifications, notification_prefs, google_connections, calendar_cleanup, lead_import_batches

Rows written by triggers copy `office_id` from the row that caused them. They never rely on the default, because triggers can run without a signed-in user.

### Rows stay inside their office
The database refuses any row that points at a row in another office. For example, a lead in office A can't use a niche, campaign or owner from office B, and an activity can't point at a lead from another office.
- Row Level Security (RLS) doesn't protect this on its own: foreign-key checks skip RLS.
- Every business table has one trigger, `zz_office_refs` (function `office_refs()`), built from its single-column foreign keys. It:
  - fills `office_id` from the first parent row when it's empty (rows written without a signed-in user)
  - refuses a row whose parents are in another office: "Rows must stay inside one office"
  - refuses changing a row's office
- Stage and outcome references are composite foreign keys, `(office_id, stage_key)` and `(office_id, outcome_key)`, so they can only use the same office's rows.

### Uniqueness becomes per office
| Was | Becomes |
|---|---|
| one founder in the whole database (`profiles_single_founder`) | one founder per office |
| list names unique (niches, channels, lead_sources, lost_reasons, campaigns, content_pillars, …) | unique per `(office_id, name)` |
| `stages.key`, `outcomes.key` primary keys | primary key `(office_id, key)`; references to them include `office_id` |

Stage and outcome **keys and flags are identical in every office**, because the code relies on them. Only labels and probabilities differ.

`lead_import_batches.code` stays unique across the whole app. Its number means nothing to an office.

### Default settings for a new office
`create_office` inserts the defaults from docs/02 section 3 for the new office:
- niches, channels, lead sources, lost reasons, activity types, outcomes, stages
- the hidden **CSV import** lead source

Today these rows are inserted once by the first migration. Move them into one function that both the migration and `create_office` use.

### Indexes
Large tables (leads, contacts, activities, opportunities, feed_events, notifications, tasks, posts, meetings) get indexes that start with `office_id`, matching how screens filter.

## 4. Security

RLS is still the only security boundary (docs/03). Migration `20261002000100_office_boundary.sql` builds the wall like this:

- **`current_office_id()`** returns the caller's office, but only while they're an active member of an active office. Otherwise it returns null, so a deactivated user or a suspended office reads nothing. `is_active_user()`, `is_founder()`, `current_user_role()` and `can_import_leads()` build on it.
- **One restrictive policy per business table**, `office_boundary`: `office_id = current_office_id()`. Restrictive policies are ANDed with the existing ones, so every rule in docs/03 now also stops at the office wall.
- **Trusted contexts see every office, as before:** migrations, the SQL editor, the service-role key, and the triggers they fire. `is_trusted_context()` means no signed-in user and not the `anon` role.
- **`security definer` functions run inside the wall.** The `postgres` role bypasses RLS, so these functions are owned by `office_definer` instead: a NOLOGIN role without BYPASSRLS. Inside them, only the office wall applies, through one permissive `office_definer_all` policy per table. They still do their own role checks, as before.
- **A short, reviewed list of functions stays owned by `postgres`.** These read only the caller's own profile, are the platform admin's, or are sign-up and setup:
  - `current_office_id`, `is_active_user`, `is_founder`, `current_user_role`, `can_import_leads`, `my_account_state`
  - `is_platform_admin`, `admin_office_summary`, `create_office`, `discard_empty_office`, `setup_first_office`, `seed_office_defaults`
  - `handle_new_user`, `office_refs`, `office_seat_error`, `trg_first_founder_is_admin`, `trg_pending_member_insert`, `trg_profile_seats`

  `supabase/tests/07_offices_test.sql` fails if this list changes. A new function added without review is caught.
- **Joins inside functions** also match on office (stage and outcome lookups), because trusted contexts see every office.

The functions this covers (they now run inside the wall):
  - `log_activity`, `book_meeting`, `ensure_recurring_tasks`, `tasks_with_progress`, `count_task_progress`
  - `metrics_scoreboard`, `metrics_by_dimension`, `metrics_daily`, `pipeline_summary`, `active_mrr`, `social_metrics`
  - `ensure_post_slots`, `mark_missed_posts`, `request_post_changes`, `team_calendar_status`, `prune_my_notifications`
  - `import_conflicts`, `import_lead_batch`, and every trigger function

- **Triggers that look for "the founder"** now look for the founder **of the row's office**. Today they take any founder in the database: notification routing, lead import and the hardening migration.
- **Realtime** subscriptions (feed, notifications) already pass through RLS. The two-office tests prove that no event crosses offices.
- **The platform admin's office list** comes from `admin_office_summary()`. It is `security definer`, checks `is_platform_admin()`, and returns only the columns in section 6. It returns no names of leads, contacts or deals.

## 5. Sign-up, members and seats

### Creating a member (every path)
1. The server action finds the caller's office **from the caller's own profile**, never from form input.
2. It inserts a `pending_members` row with that office and the chosen role.
3. It creates the auth user as today (add with a password, or invite when email is on).
4. The `handle_new_user` trigger reads and deletes the `pending_members` row, then creates the profile with that office and role.
   - With **no** row, the trigger raises an error and the auth user isn't created, so a stray sign-up can't produce a profile.
   - "The first user becomes founder" is gone. A founder is created only through `create_office` or `/setup`.
5. The action sets niche and time zone as today.

The new profile starts with the office's time zone. The Add member form starts with it too, and the founder can change it.

A reservation left behind by a failed add is cleared after 10 minutes.

### An email already has an account
Emails are unique across the whole app, because Supabase Auth allows one account per email. Adding an email that already has an account, in any office, fails with **"This email already has an account. Use a different email."** The message never says which office has it.

### Seat limit
A trigger on `profiles` refuses to add or reactivate an active member when the office already has `seat_limit` active members. It also runs before the auth user is created (the pending row checks it), so no orphan auth user is left. The Team form shows the error inline:

> "Your office is using all {n} seats. Deactivate someone or contact us for more seats."

### Suspended office
Every member's data access stops (section 4). Signing in is refused, and an open session is signed out on its next page load. `/login` then shows:

> "Your office's access is paused. Contact us to turn it back on."

`my_account_state()` tells the app why a signed-in user can't read anything: `deactivated` or `suspended`. Reactivating restores everything; nothing is deleted. A platform admin can't suspend their own office.

## 6. Screens

### `/setup` (fresh install only)
Only when **no office exists**. Fields: office name, your name, email, password, time zone.
- Creates the first office, its founder, and makes that person a platform admin.
- Returns 404 once any office exists.

### Sidebar
Shows the office name above the navigation. The founder's department switcher (docs/07) stays where it is.

### Settings → Office (founder)
Office name and default time zone, each saved with **Save**. The seat limit is shown read-only: "{active} of {limit} seats used", or "{active} members" when there's no limit.

### `/admin` (platform admins only)
Nav item **Offices**, visible only to platform admins. Everyone else gets 404.

**Table:** office name, status chip (Active / Suspended), founder email, members "{active} / {limit}", leads count, last activity (latest feed event, relative), created. Sorted by name. Search by office name.

**Create office** (side panel):
- office name, time zone, seat limit (empty = no limit)
- founder name, founder email, password and confirm (minimum 10 characters), as in Team → Add member
- When `EMAIL_INVITES=on`: a "Send an invite email instead" option

The **Create office** button calls `create_office(name, timezone, seat_limit, founder_email)`. That function checks `is_platform_admin()`, inserts the office and its default settings, and inserts the founder's `pending_members` row. The action then creates the auth user with the admin client. If that fails, `discard_empty_office` removes the empty office so the form can be sent again.

**Row actions:**
- **Edit**: name and seat limit.
- **Suspend**: confirmation: "Suspend {name}? Its members lose access until you reactivate it. Nothing is deleted." Button **Suspend office**.
- **Reactivate**.

**Acceptance:** a platform admin opens `/admin` but gets "not found" on a lead URL from another office. A founder who isn't a platform admin gets 404 on `/admin`.

## 7. Service-role key

It is still used only in `src/lib/supabase/admin.ts`. Two kinds of caller may use it, and each checks the caller first:

1. **A founder** (active, office active): the existing uses in docs/03 section 4, for members of **their own office only**. The action checks that the target profile's `office_id` equals the founder's.
2. **A platform admin**: creating an office's founder user. Nothing else. Suspend, reactivate and edit go through `security definer` functions, not the service-role key.

## 8. Existing data (M14 migration)

In one migration:
1. Create office #1 named **"My office"** with time zone `Asia/Karachi` and no seat limit.
2. Set `office_id` on every existing row, then make the column `not null`.
3. Make the existing founder a platform admin.

The founder renames the office in Settings → Office. Test this migration on a copy of production before running it there.

A dedicated copy for one customer is simply an install with one office. It needs no special code.

## 9. Not in this phase

- billing, trials and self-serve sign-up
- deleting an office, and data export
- office logo, custom domains, white-label
- one person in several offices, or moving a member between offices
- a read-only mode for unpaid offices
- platform admins viewing an office's data, or "log in as"
- choosing a data region per office (use a dedicated copy)
