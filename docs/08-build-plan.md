# 08 — Build plan

Build in this order. Each milestone ends with a working, deployable app and a checklist that must pass. Record progress in `docs/PROGRESS.md`.

## Environment

`.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only, used in src/lib/supabase/admin.ts
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

In Supabase Auth settings:
- set Site URL and redirect URLs (`/accept-invite`, `/reset-password`)
- after the founder exists, turn off public sign-ups
- customise the invite email subject: "You're invited to Client Acquisition OS"

---

## M0: Foundation
- Create the Next.js app (TypeScript strict, Tailwind, ESLint), pnpm, shadcn/ui init, and the libraries from CLAUDE.md.
- Add design tokens and fonts from docs/06. Build a hidden `/dev/ui` page showing buttons, inputs, chips, the pace bar, table and side panel, to review the look early.
- Set up the Supabase CLI and local stack, apply the migration, and generate types.
- Create `lib/supabase/{browser,server,admin}.ts`, the middleware (session refresh + route guards), and `lib/dates.ts` + `lib/format.ts` with unit tests.
- Run `supabase/tests` against local Postgres (see `00_supabase_stub.sql` header), or port the checks to pgTAP. Every SHOULD_FAIL line must error and every other check must pass.

**Done when:**
- ☐ `pnpm lint typecheck test` pass
- ☐ `/dev/ui` matches docs/06
- ☐ the migration applies cleanly on a fresh local database

## M1: Auth, team and profile
- `/setup`, `/login`, `/accept-invite`, `/reset-password`
- `(app)` layout with a role-aware sidebar, and a profile context (id, name, role, timezone)
- `/team` (invite, resend, edit, deactivate, reactivate), `/profile`

**Done when:**
- ☐ the founder is created via `/setup`, and `/setup` then 404s
- ☐ an invited BD sets a password and lands on My Day (empty placeholder)
- ☐ a BD opening `/team` is redirected
- ☐ a deactivated BD can't sign in, and an existing session reads no data
- ☐ changing time zone updates the displayed date

## M2: Settings
- `/settings` tabs: Lists, Activity types, Outcomes and stages, Campaigns, Targets

**Done when:**
- ☐ hidden items disappear from dropdowns but still show on existing records
- ☐ a stage probability change updates weighted value on the next load
- ☐ BD requests to change settings are rejected by the database (test with a BD session calling the action directly)

## M3: Leads
- Zod schemas (`lib/validation/lead.ts`), normalisers (URL, LinkedIn, phone, email), and `lib/completeness.ts` (mirror of SQL) with tests
- Add/edit lead side panel, duplicate check, leads list (filters, search, views, bulk actions), lead page (without the timeline yet), contacts CRUD, reassign (founder), delete (founder)

**Done when:**
- ☐ every acceptance check in docs/07, sections 3–5 passes
- ☐ unit tests cover every normaliser, including bad input
- ☐ TypeScript completeness equals the database value for 10 fixture leads

## M4: Activities and My Day
- Log activity side panel (uses `log_activity`), timeline on the lead page, "Create opportunity?" prompt (stub: creates the opportunity with title and value only)
- My Day: counters, follow-ups, coming up (tasks block comes in M6)
- Global keyboard shortcuts N, L, /, G-M, G-L

**Done when:**
- ☐ lead status transitions follow the table in docs/04, section 2 (e2e test)
- ☐ overdue and today follow-ups respect the user's time zone (test with a Berlin user)
- ☐ activities can be backdated up to 7 days, not more

## M5: Pipeline
- Board with dnd-kit, Won/Lost dialogs, list view, opportunity side panel with stage history, stage dropdown on the lead page

**Done when:**
- ☐ docs/07, section 7 acceptance passes
- ☐ reassigning a lead moves its open opportunity but not a won one

## M6: Tasks
- Founder Tasks page, new task panel with common tasks, repeating tab, BD read-only view, tasks block on My Day, Flag lead action and badge

**Done when:**
- ☐ a repeating count task appears Mon–Fri only, once per day
- ☐ it completes automatically at target and posts to the feed
- ☐ a lead-fix task is created by Flag lead and clears the badge when ticked
- ☐ overdue logic uses the assignee's time zone

## M7: Feed
- `/feed` with Realtime subscription, filters, "N new" pill, hover actions

**Done when:**
- ☐ an event from a BD session appears on the founder's open page in about 2 seconds
- ☐ a BD session gets no feed rows

## M8: Performance
- `lib/metrics.ts` (rates, range targets, pace), with unit tests
- Performance page: all 7 blocks, compare toggle, drill-down panels

**Done when:**
- ☐ an e2e test seeds known activities and checks every scoreboard number
- ☐ BD view shows only self
- ☐ the page loads in under 1.5s with the demo data set

## M9: Polish and launch
- Command menu, empty states and copy review against docs/06, section 7, accessibility pass (keyboard-only walkthrough, contrast check), error boundaries, 404 page
- Demo data seed script (below), README with setup steps
- Deploy: Vercel project + Supabase Cloud, run migrations, create the founder, turn off sign-ups

**Done when:**
- ☐ a new BD can go from invite email to first logged activity with no help
- ☐ Lighthouse accessibility ≥ 95 on My Day, Leads and Performance
- ☐ no console errors

---

## Demo data (`pnpm seed:demo`, local only)

Refuse to run unless `NEXT_PUBLIC_SUPABASE_URL` points at localhost. Using the admin client, create:

- **Users:** founder Zain (Asia/Karachi); BDs Ahmed (Dental), Sara (Law), Bilal (AI SaaS, Europe/Berlin). Password `demo-password-123`.
- **Targets:**
  - each BD: leads 112, outreach 75, follow-ups 100, meetings 3
  - founder: outreach (Upwork proposals) 25
- **Campaigns:** Dental AI Intake (LinkedIn), Dental Website Migration (Email), Law AI Intake (LinkedIn), AI SaaS Development (LinkedIn).
- **Leads:** about 60 per BD over the last 21 days, with realistic US company names per niche, cities and states, 1–3 contacts, and mixed completeness (some deliberately under 50%).
- **Activities:** about 3 per lead following realistic sequences (outreach → follow-up → sometimes a reply), including some overdue next actions.
- **Opportunities:** 12 in varied stages (2 won: one one-time, one monthly; 2 lost).
- **Tasks:** one repeating count task per BD, 3 checklist tasks, and 1 flagged lead.

Insert rows as the right user (sign in as each user with the anon client) so triggers credit the right person, or set `created_by`/`user_id` explicitly with the admin client.

## Testing summary

| Layer | Tool | Must cover |
|---|---|---|
| SQL | `supabase/tests/*.sql` (or pgTAP) | RLS matrix, triggers, metric functions |
| Unit | Vitest | dates/time zones, normalisers, completeness, metrics formulas |
| E2E | Playwright | invite → first activity; lead status flow; pipeline won/lost; count task auto-complete; BD isolation; performance numbers |

## Definition of done (every milestone)
- Lint, typecheck and tests pass.
- Acceptance checks for the milestone are ticked in `docs/PROGRESS.md`.
- No TODOs left in the milestone's code without a matching note in PROGRESS.md.
- Screens match docs/06 and docs/07. Copy follows the copy rules.
