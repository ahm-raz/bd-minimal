# MISSION
Build "Client Acquisition OS v1" completely, from an empty Next.js setup to a finished, tested, locally running app. Work through ALL milestones M0 → M9 in docs/08-build-plan.md in one continuous run.

You are working autonomously. Do NOT stop, pause, ask for confirmation, or wait for review between steps or milestones. The only output I want from you before the end is the work itself (code, commits, docs/PROGRESS.md). Report once, at the very end (section 9).

The complete spec is in this repo and is the source of truth:
- CLAUDE.md
- docs/01-product-spec.md … docs/08-build-plan.md
- supabase/migrations/20260924000000_init.sql (finished and tested database)
- supabase/tests/

# 1. AUTONOMY RULES (read twice)
1. **Never stop to ask.** When something is unclear or the docs conflict:
   - choose the option that best matches docs/01 (product intent), then docs/07 (screens), then docs/06 (design)
   - make it
   - log it under "Decisions" in docs/PROGRESS.md with one line of reasoning
   - continue
2. **Never stop on a failing test or build.** Debug properly: read the error, check the spec, fix the root cause. Up to 3 real attempts per problem. If it still fails:
   - mark it with `test.fixme` or a clearly named TODO
   - log it under "Known issues" in PROGRESS.md with the error and what you tried
   - move on
   Never delete or weaken an assertion just to make it pass.
3. **Never stop on a changed library API.** Look up the current usage (node_modules types, the package README/CHANGELOG, or official docs), use the current API, and log it under "Deviations".
4. **Infrastructure problems:** if Docker or Supabase won't start, try to fix it (start Docker, `supabase stop --no-backup` then `supabase start`, free ports, check `docker ps`). If it's truly impossible:
   - continue with everything that doesn't need the database (UI, validation, unit tests, pure logic)
   - retry the database every milestone
   - list it first in the final report
5. **The database migration is finished and tested.** Do not edit 20260924000000_init.sql. If you truly need a schema change, add a NEW migration with a later timestamp, regenerate types, rerun `pnpm db:test`, and log why.
6. **Stay in scope.** Build exactly what the docs describe. Nothing from "Out of scope" in docs/01. No extra libraries beyond CLAUDE.md unless a spec feature is impossible without one (log it).
7. **Security rules from CLAUDE.md are absolute:**
   - RLS is the security boundary
   - the service key is used only in src/lib/supabase/admin.ts (`import "server-only"`), and only after a server-side founder check
   - business rules that live in SQL triggers are never reimplemented in TypeScript
   - KPIs come only from the SQL metric functions
8. **Context management.** This is a long run. docs/PROGRESS.md is your memory.
   - At the start of every milestone, re-read CLAUDE.md, PROGRESS.md and that milestone's section of docs/08 plus the docs/07 sections it touches.
   - If you ever lose track (e.g. after context compaction), re-read PROGRESS.md and continue from the first unticked item.
9. **No remote actions.** Never run `supabase db push`, `supabase link`, deploy commands, or anything that touches a remote project. Never print or commit secrets.

# 2. THE LOOP (repeat for each milestone M0 → M9)
For each milestone:
1. **Read:** CLAUDE.md, PROGRESS.md, the milestone in docs/08, and the related docs/04, 05, 06, 07 sections.
2. **Plan:** write the milestone's task list into PROGRESS.md as checkboxes (acceptance checks from docs/07 plus the "Done when" items from docs/08).
3. **Build:** in small steps. After each meaningful step, run typecheck and the relevant tests.
4. **Verify the whole milestone:**
   `pnpm lint && pnpm typecheck && pnpm test && pnpm db:test && pnpm test:e2e && pnpm build`
5. **Visual self-review:** a Playwright script (scripts/screenshots.ts) captures every page touched in this milestone at 1440×900 as founder and as BD, into ./screenshots/.
   - Look at each screenshot and compare it against docs/06: tokens, type scale, spacing, chips, pace bar, empty states, copy rules (sentence case, verb buttons, no all-caps labels, no arrows in buttons, no middle-dot separators).
   - Fix what's off. One review pass per milestone is enough.
6. **Update PROGRESS.md:** tick items; record Decisions, Deviations and Known issues.
7. **Commit:** `git commit -m "M<n>: <name>"`, then IMMEDIATELY start the next milestone.

# 3. ENVIRONMENT SETUP (part of M0)
- **Check** node (20.9+, prefer 22), pnpm (`corepack enable` if missing), docker, git.
  - Supabase CLI: add `supabase` as a dev dependency and call it via `pnpm supabase`.
  - psql may be missing; use `docker exec -i <supabase db container> psql -U postgres` as the fallback.
- **git:** `git init` if needed.
  - .gitignore: node, .next, .env*.local, supabase/.temp, supabase/.branches, playwright-report, test-results, coverage, screenshots
  - commit the existing docs first: "docs: v1 spec"
- **Next.js scaffold:** the repo root already has CLAUDE.md, docs/ and supabase/.
  - Scaffold in `.tmp-app` with `pnpm create next-app@latest .tmp-app --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm` (adapt flags to the current version).
  - Move the files to the root without overwriting CLAUDE.md, docs/ or supabase/. Merge .gitignore. Delete .tmp-app.
  - Follow the installed Next.js version's conventions, e.g. whether request interception is `middleware.ts` or `proxy.ts`.
  - tsconfig: `strict: true`, `noUncheckedIndexedAccess: true`.
- **Libraries (only these):**
  - Runtime: @supabase/supabase-js, @supabase/ssr, react-hook-form, zod, @hookform/resolvers, @tanstack/react-table, @dnd-kit/core, @dnd-kit/sortable, recharts, libphonenumber-js, date-fns, @date-fns/tz, sonner, cmdk, lucide-react, server-only
  - Dev: supabase, vitest, @vitejs/plugin-react, jsdom, @testing-library/react, @playwright/test (install chromium), prettier, prettier-plugin-tailwindcss, tsx
  - shadcn/ui init, then add the components you need: button, input, textarea, label, select, checkbox, switch, dialog, sheet, dropdown-menu, popover, command, calendar, badge, table, tabs, tooltip, separator, skeleton, avatar, form, sonner, scroll-area, alert-dialog
- **Scripts:**
  - dev, build, start, lint, format
  - typecheck (`tsc --noEmit`)
  - test (`vitest run`), test:e2e (`playwright test`)
  - db:start, db:stop, db:reset, db:types (`supabase gen types typescript --local > src/lib/database.types.ts`)
  - db:test, seed:demo, screenshots
- **Local Supabase in Docker:**
  - `pnpm supabase init`, keeping existing supabase/migrations and supabase/tests.
  - config.toml:
    - site_url = "http://localhost:3000"
    - additional_redirect_urls = ["http://localhost:3000/accept-invite", "http://localhost:3000/reset-password"]
    - enable_signup = false
    - email confirmations off
    - realtime on
  - `pnpm db:start`, then `pnpm db:reset`; the migration must apply cleanly.
  - .env.local from `pnpm supabase status`: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (anon or publishable key), SUPABASE_SERVICE_ROLE_KEY (service_role or secret key), NEXT_PUBLIC_SITE_URL=http://localhost:3000. Also write .env.example with empty values.
  - `pnpm db:types`.
- **SQL smoke test against local Supabase:** scripts/db-test.sh does db reset → run supabase/tests/02_smoke_test.sql → db reset again.
  - NEVER run 00_supabase_stub.sql against Supabase. It's only for plain Postgres.
  - If Supabase's real auth.users insert needs extra columns (instance_id, aud, role), adapt only that insert.
  - **Expected:** the 11 SHOULD_FAIL lines print ERROR, and every other check prints its value, including:
    - ROLES Ahmed:bd, Sara:bd, Zain:founder
    - TASKS 3|3|done
    - STATUS_AFTER_REPLY replied
    - LEAD_STATUS_WON customer
    - SARA_SEES_LEADS 0
    - FOUNDER_SEES_LEADS 3
    - FEED 10
  - Make the script exit non-zero if any expected value is missing, so `pnpm db:test` is a real gate.
- **Test isolation:** Playwright globalSetup runs `supabase db reset` so e2e runs are repeatable. Use one worker for e2e. Build a helper (tests/e2e/helpers.ts) that creates the founder and BDs through the admin API and signs in as any of them.
- **Local email:** invite and reset emails go to the local inbox (Mailpit/Inbucket, usually http://127.0.0.1:54324). e2e tests read invite links from its HTTP API.

# 4. MILESTONE REQUIREMENTS (details are in docs; these are the must-haves)

## M0: Foundation
- Design tokens from docs/06 as CSS variables mapped into Tailwind and the shadcn theme: exact hex values, light only, IBM Plex Sans 400/500/600 + Plex Mono via next/font, `.num` tabular utility.
- src/lib/supabase/{browser,server,admin}.ts per current @supabase/ssr docs.
- Middleware/proxy: session refresh; signed-out users go to /login (except auth pages, /setup, static files); BDs are redirected from /feed, /team, /settings to /my-day.
- src/lib/dates.ts (docs/04, section 8): todayIn, rangeFor(preset, tz) → {fromUtc, toUtc, fromDate, toDate}, weekdaysBetween, relative formatting. Tests include the Europe/Berlin DST case and an Asia/Karachi midnight edge.
- src/lib/format.ts: money, percent ("–" when the denominator is 0), phone display. Add tests.
- /dev/ui (404 in production): all buttons, inputs with errors, all stage and status chips, pace bar (green/amber/red with marker), table, sheet with form, empty state.

## M1: Auth, team, profile
- **/setup:** only when no profiles exist, else 404. Admin createUser with email_confirm, then the trigger makes them founder. Set time zone, sign in.
- **Auth pages:** /login, /accept-invite, /reset-password, with copy exactly as in docs/07, section 1.
- **(app) layout:** sidebar per docs/06, role-aware nav, ProfileProvider (id, name, role, timezone), Toaster.
- **/team:**
  - statuses Active / Invited (no last_sign_in_at) / Deactivated
  - invite (inviteUserByEmail with redirectTo /accept-invite, then set niche and time zone with the admin client)
  - resend, edit
  - deactivate (is_active false + ban "876000h") and reactivate (ban "none")
  - dialog copy from docs/07, section 11
- **/profile:** name, time zone (Intl.supportedValuesOf, with local time preview).
- **e2e:** setup → /setup 404s; invite via inbox link → BD on My Day; BD blocked from /team; deactivated BD can't sign in; time zone changes the displayed date.

## M2: Settings (docs/07, section 12)
- Lists (add, rename inline, reorder, hide/show)
- Activity types with category help text
- Outcome labels; stage labels + probabilities
- Campaigns table
- Targets grid (people × metrics, save on blur, daily equivalent shown)
- e2e: a hidden item disappears from dropdowns but stays on existing records; a BD calling a settings action directly is rejected by the database.

## M3: Leads (docs/04, section 1; docs/07, sections 3–5)
- **Zod schemas and normalisers** (URL, company/contact LinkedIn, email, E.164 phone with default country, Maps URL, Upwork URL, tags) with exhaustive unit tests.
- **lib/completeness.ts** mirroring the SQL. A test proves it equals the database value on 10 fixture leads.
- **Add/edit lead side panel:**
  - all 8 sections
  - "at least one way to reach them" rule, including the Upwork exception
  - paste helpers
  - live completeness meter with missing-item links
  - Save lead / Save and add another
  - the duplicate notice (own leads only: domain, name, email, LinkedIn)
- **Leads list:**
  - TanStack table with all columns and saved column visibility
  - search, all filters kept in the URL
  - built-in views
  - bulk actions (founder adds Reassign/Delete)
- **Lead page:**
  - header with local time, links, flag badge placeholder
  - contacts CRUD with primary switching
  - details
  - ownership history (founder)
  - reassign and delete (founder; delete confirm by typing the company name)

## M4: Activities + My Day (docs/04, section 3; docs/07, sections 2, 6)
- **Log activity side panel via the `log_activity` RPC:**
  - outcomes filtered by category, with correct defaults
  - next action required unless "No next step" / Not interested / Bounced
  - date chips
  - backdating up to 7 days
  - Meeting booked → "Create opportunity?" dialog; Proposal sent → "Move to Proposal sent?"
  - BD edit window of 24h
- **Lead timeline:** activities, stage changes, owner changes, creation; filter chips.
- **My Day:** Today-so-far pace bars (targets + `metrics_scoreboard` for today), follow-ups (overdue then today) with one-click Log, Coming up (7 days), empty states. The tasks block comes in M6.
- **Shortcuts:** N, L, /, G then M/L/P, Esc.
- **e2e:** the status transition table from docs/04, section 2; overdue logic for a Europe/Berlin user.

## M5: Pipeline (docs/07, section 7)
- dnd-kit board: 6 columns; Won/Lost limited to 30 days with Show all; column counts, values, weighted values; stuck indicator.
- Won and Lost dialogs; cancel returns the card; optimistic update with rollback.
- Opportunity side panel with stage history; list view; stage dropdown on the lead page; founder owner filter.
- e2e: won/lost flows; reassigning a lead moves its open opportunity but not a won one.

## M6: Tasks (docs/04, section 6; docs/07, section 8)
- **Founder Tasks page:**
  - date picker; call `ensure_recurring_tasks` for each active member on weekdays
  - grouped by person, with "Still overdue"
  - new task panel (count/checklist, filters, linked record, repeat on weekdays)
  - "Start from a common task" (the 8 in docs/04)
  - repeating templates tab (edit future, stop)
- BD read-only view with ticking for checklist and lead-fix tasks.
- My Day tasks block (call `ensure_recurring_tasks` for self on load).
- Flag lead action + red badge until the lead-fix task is done.
- e2e: a repeating count task appears Mon–Fri only, once per day, and auto-completes at target with a feed event; flag → lead-fix task → badge clears.

## M7: Feed (docs/07, section 9)
- Realtime subscription on feed_events; filters (person, event type, date); "N new" pill; infinite scroll; hover actions (Open, Flag lead).
- e2e: a BD's event appears on the founder's open feed without refreshing; a BD gets no feed rows.

## M8: Performance (docs/05, docs/07 section 10)
- lib/metrics.ts: rates ("–" on zero), range targets (weekly ÷ 5 × weekdays), daily target, pace marker and pace color. Full unit tests.
- **Page:**
  - date range + person filter (a BD is fixed to self)
  - compare-to-previous toggle
  - summary stat blocks
  - scoreboard with pace bars, completeness and flags
  - funnel
  - niche/channel/campaign tabs with a Recharts reply-rate chart
  - consistency grid
  - pipeline health (`pipeline_summary`, `active_mrr`, stuck list)
  - tasks block
  - drill-down side panels for every number
- e2e: seed known activities and assert every scoreboard number; a BD cannot see other people's numbers even via the URL.

## M9: Polish
- **Command menu** (Ctrl/Cmd+K): leads, contacts, opportunities, actions.
- **Copy review** of every screen against docs/06, section 7.
- **Accessibility:** keyboard-only walkthrough, focus rings, contrast. Lighthouse accessibility ≥ 95 on My Day, Leads and Performance (run Lighthouse via Playwright or the lighthouse CLI locally; log the scores).
- Error boundaries, a 404 page, loading skeletons everywhere.
- **scripts/seed-demo.ts** (`pnpm seed:demo`, refuses unless the URL is localhost), exactly as described in docs/08 "Demo data". Insert rows as the correct users so triggers credit the right person.
- **README.md:** prerequisites, setup from a fresh clone, all scripts, local URLs, demo logins, how to run tests.
- **Final full run:** db reset → seed:demo → the full verification command → screenshots of every page as founder and as BD → a final visual review.

# 5. QUALITY BAR (applies everywhere)
- TypeScript strict, no `any` (use generated database types), no ts-ignore without a comment.
- Server Components by default. Server Actions for mutations, each validating input with the same Zod schema as its form and returning typed `{ ok, error, fieldErrors }` results.
- Every list has loading skeletons, an empty state with an action, and an error state that says what happened and what to do.
- Optimistic UI only where docs/06 says so, always with rollback.
- Money, percent, dates and time zones always go through lib/format.ts and lib/dates.ts.
- No console errors or warnings in the browser during e2e runs (fail the test on console errors).
- Accessible names on every icon button; visible focus; forms fully usable by keyboard.

# 6. DOCS/PROGRESS.md FORMAT (keep it current at all times)
- **Status:** current milestone and next step (one line; update constantly)
- **Milestones M0–M9:** a checklist per milestone (ticked as done)
- **Decisions:** date, decision, reason
- **Deviations:** from docs or assumed library APIs
- **Known issues:** error, what was tried, suggested fix
- **How to run:** commands and URLs

# 7. START NOW
Begin with M0 environment setup. Don't write a plan and wait. Write the M0 checklist into PROGRESS.md and start executing.

# 8. IF THE SESSION IS INTERRUPTED
When resumed with "continue", re-read CLAUDE.md and docs/PROGRESS.md and carry on from the first unticked item. Don't redo finished work.

# 9. FINAL REPORT (only after M9's final full run)
- **Done:** one sentence on the state of the app.
- **Run it:** exact commands from a fresh clone, then the URL to open, plus demo logins.
- **Local URLs:** app, Supabase Studio, email inbox.
- **Results:** lint, typecheck, unit tests (count), db:test, e2e (passed/fixme counts), build, Lighthouse scores.
- **Decisions and deviations:** the list from PROGRESS.md.
- **Known issues:** anything marked fixme or TODO, with a suggested fix.
- **Screenshots:** the folder path.