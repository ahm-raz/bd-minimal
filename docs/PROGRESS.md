# Progress

**Status:** M5 done. Next: M6 (tasks).

## Milestones

### M0: Foundation
- [x] git init, .gitignore, commit spec
- [x] Next.js 16 scaffold moved to root, pnpm
- [x] Libraries installed (runtime + dev), Chromium for Playwright
- [x] shadcn/ui init (radix base) and components
- [x] Supabase CLI local stack, config.toml (site_url, redirects, signup off, confirmations off, realtime on)
- [x] Migration applies cleanly on a fresh local database
- [x] .env.local / .env.example
- [x] tsconfig strict + noUncheckedIndexedAccess, package scripts
- [x] `pnpm db:types`
- [x] scripts/db-test.sh (smoke test is a real gate)
- [x] Design tokens (docs/06) as CSS variables, Plex Sans/Mono, `.num`
- [x] src/lib/supabase/{browser,server,admin}.ts
- [x] proxy: session refresh, signed-out redirect, BD route guard
- [x] src/lib/dates.ts + tests (Berlin DST, Karachi midnight)
- [x] src/lib/format.ts + tests
- [x] /dev/ui (404 in production)
- [x] Vitest + Playwright config, e2e globalSetup (db reset), helpers
- [x] scripts/screenshots.ts
- [x] Verify: lint, typecheck, test, db:test, test:e2e, build

### M1: Auth, team, profile
- [x] /setup (404 once a profile exists)
- [x] /login, /accept-invite, /reset-password with docs/07 §1 copy
- [x] (app) layout: sidebar, role-aware nav, ProfileProvider, Toaster
- [x] /team: statuses, invite, resend, edit, deactivate/reactivate, dialog copy
- [x] /profile: name, time zone with local time preview
- [x] e2e: setup then 404; invite link → My Day; BD blocked from /team; deactivated BD can't sign in; time zone changes date

### M2: Settings
- [x] Lists (add, rename inline, reorder, hide/show)
- [x] Activity types with category help
- [x] Outcome labels; stage labels + probabilities
- [x] Campaigns table
- [x] Targets grid (save on blur, daily equivalent)
- [x] e2e: hidden item gone from dropdowns but kept on records; BD settings action rejected by DB

### M3: Leads
- [x] Zod schemas + normalisers with exhaustive tests
- [x] lib/completeness.ts equals DB on 10 fixtures
- [x] Add/edit lead panel (8 sections, reach rule, paste helpers, meter, duplicate notice)
- [x] Leads list (table, column visibility, search, URL filters, views, bulk actions)
- [x] Lead page (header, contacts CRUD, details, ownership history, reassign, delete)

### M4: Activities + My Day
- [x] Log activity panel via log_activity
- [x] Opportunity / proposal prompts; 24h BD edit window
- [x] Lead timeline with filter chips
- [x] My Day: pace bars, follow-ups, coming up, empty states
- [x] Shortcuts N, L, /, G M/L/P, Esc
- [x] e2e: status transitions; Berlin overdue logic; backdating limit

### M5: Pipeline
- [x] dnd-kit board, Won/Lost dialogs, optimistic + rollback
- [x] Opportunity side panel with history, list view, lead page stage dropdown, owner filter
- [x] e2e: won/lost flows; reassign moves open opp only

### M6: Tasks
- [ ] Founder tasks page, new task panel, common tasks, templates tab
- [ ] BD read-only view with ticking
- [ ] My Day tasks block
- [ ] Flag lead + badge
- [ ] e2e: repeating Mon–Fri; auto-complete + feed; flag → fix → badge clears

### M7: Feed
- [ ] Realtime feed, filters, N new pill, infinite scroll, hover actions
- [ ] e2e: BD event appears live; BD gets no feed rows

### M8: Performance
- [ ] lib/metrics.ts with unit tests
- [ ] Page: all blocks, compare toggle, drill-downs
- [ ] e2e: scoreboard numbers; BD isolation

### M9: Polish
- [ ] Command menu
- [ ] Copy review, accessibility, Lighthouse ≥ 95
- [ ] Error boundaries, 404, skeletons
- [ ] seed-demo.ts
- [ ] README
- [ ] Final full run + screenshots

## Decisions
- 2026-09-24: Local Supabase uses ports 55420–55429 (API 55421, DB 55422, Studio 55423, Mailpit 55424). Another local Supabase project ("bdms") already occupies 5432x; stopping someone else's stack would be destructive.
- 2026-09-24: Storage, edge runtime and analytics containers disabled in config.toml; the spec uses none of them and it speeds up `db:start`.
- 2026-09-24: Chip text on soft fills uses darker shades (ok #276B43, warn #93590A, lost #76605D) because the docs/06 pairs measure 4.35, 4.04 and 4.08:1, below the AA 4.5:1 that docs/06 also requires. Fills, bars and icons keep the exact token hexes.
- 2026-09-24: Invite and recovery emails link to /auth/confirm?token_hash=… (Supabase SSR pattern); the route verifies the token server-side and forwards to /accept-invite or /reset-password. Templates live in supabase/templates; production needs the same templates in the dashboard.
- 2026-09-24: /healthz route (public) used as the Playwright web-server readiness URL.
- 2026-09-24: Local auth rate limits raised (sign-ins, emails) so e2e runs don't trip them. Local only.

- 2026-09-24: Team reads `last_sign_in_at` through the Auth admin API (after the founder check) to show Invited vs Active; docs/03 defines Invited that way and auth.users isn't readable any other way. Read-only use.
- 2026-09-24: Deactivate dialog uses "their/they" instead of "his/he" (docs/07 §11 copy), because the app doesn't know anyone's pronouns.
- 2026-09-24: Signed-in sessions whose profile is deactivated are sent to /auth/signout?reason=deactivated, which clears cookies and shows the turned-off message on /login.
- 2026-09-24: "Set targets now" is a toast action after inviting; it opens Settings → Targets for that person.
- 2026-09-24: Profile "Change password" sends a reset link to the user's own email (reuses the reset flow).
- 2026-09-24: Settings actions don't pre-check the role in TypeScript; they run as the caller and treat an RLS error or a zero-row update as "no permission". This is what makes "BD requests are rejected by the database" literally true. The BD-rejection e2e test performs the same writes the actions do, with a BD session (supabase-js), and checks nothing changed.
- 2026-09-24: Won and Lost probabilities are shown read-only (100% / 0%); docs/07 §12 only asks for open-stage probabilities.
- 2026-09-24: "Hidden items stay on existing records" is verified with profile niches in M2 (leads come in M3); lead forms use the same rule: hidden items are offered only when already selected.
- 2026-09-24: Settings is split into sub-routes (/settings/lists, /activity-types, /outcomes, /campaigns, /targets) shown as tabs, so each tab is linkable (Team's "Set targets now" opens /settings/targets?person=…).
- 2026-09-24: Upwork exception to the reach rule finds the Upwork channel by name (case-insensitive "upwork"); channels have no fixed key in the schema.
- 2026-09-24: Lead + contacts are two inserts (no RPC) to avoid a schema change; if the contacts insert fails the user is told to add them on the lead page. Validation runs before either insert.
- 2026-09-24: Duplicate check for the founder is limited to the founder's own leads (docs/04: "the user's own leads").
- 2026-09-24: In the form, the first contact is always the primary; "Make primary" moves a contact to the top.
- 2026-09-24: The leads list lives in a `(list)` route group so its loading skeleton doesn't wrap /leads/[id]; with a parent loading boundary Next streams a 200 before notFound(), and a BD guessing a lead URL must get a real 404. The lead page has no skeleton (it renders in one server pass).
- 2026-09-24: Honorifics stay with the first name when pasting ("Dr. Maria Lopez" → "Dr. Maria" + "Lopez").
- 2026-09-24: Lead-list search also matches phone digits (4+) against E.164 phones.
- 2026-09-25: When an activity is logged without a next action (No next step, or Not interested / Bounced with nothing typed) the lead's next action is cleared, so finished leads drop off My Day.
- 2026-09-25: The Proposal sent prompt appears only when the lead's single open opportunity is still before Proposal sent (Qualified or Meeting done).
- 2026-09-25: My Day shows pace bars for leads added, outreach and follow-ups when a target exists (plain counts otherwise); replies and meetings booked are always plain counts, as in the docs/07 sketch.
- 2026-09-25: The L shortcut logs against the focused My Day row (rows are focusable) or the open lead page.
- 2026-09-25: Pipeline top-bar totals (open value, weighted, stuck count) come from pipeline_summary for the owner filter; column headers sum the cards shown (a view of the loaded cards, including the niche filter and 30-day window).
- 2026-09-25: Moving a Lost card back to an open stage asks "This reopens it and clears the lost reason." (docs/07 gives only the Won wording).
- 2026-09-25: Board cards are keyboard-draggable (dnd-kit keyboard sensor); Enter opens the side panel.

## Deviations
- TanStack Table installed as v9 (`useTable` + `tableFeatures`, `table.FlexRender`) instead of v8's `useReactTable`; column visibility and row selection are registered features.
- Supabase CLI: `[auth.email] enable_signup` also switches off email *sign-in*, so it stays `true`; public sign-up is disabled with the top-level `[auth] enable_signup = false` (verified: /auth/v1/signup returns signup_disabled).
- `typecheck` runs `next typegen` first, because Next 16 route types (PageProps/LayoutProps) are generated.
- Next dev indicator turned off (next.config.ts): it covered the sidebar user menu.
- Next.js 16.3 scaffold; `create-next-app` refuses names starting with a dot, so the scaffold used `tmp-app` instead of `.tmp-app`.
- Next.js 16 renamed middleware to proxy: route guards live in src/proxy.ts.
- shadcn 4.x generated components import `cn` from the `cn` package and use `radix-ui`; next-themes was removed (light only).
- Vitest config is vitest.config.mts (ESM).
- shadcn 4.x no longer ships the `form` component; `field` was added instead and forms use react-hook-form directly with it.

## Known issues
- supabase/tests/02_smoke_test.sql calls `metrics_daily(current_date-6, current_date, 'Asia/Karachi')`; `current_date` is UTC, so between 19:00 and 24:00 UTC the day's leads fall outside the range and DAILY sums to 0 instead of 3. Not an app bug. scripts/db-test.sh expects 3 or 0 depending on whether the Karachi and UTC dates match. Suggested fix: use `(now() at time zone 'Asia/Karachi')::date` in the test.
- 2026-09-25: a crash mid-session zeroed two files (leads-view.tsx, timeline.tsx) and the .next cache; they were restored from git and rewritten. If a file ever shows as binary in git, restore it from the last commit.

## How to run
```bash
pnpm install
pnpm db:start        # local Supabase in Docker
pnpm dev             # http://localhost:3000
```
- App: http://localhost:3000
- Supabase Studio: http://127.0.0.1:55423
- Email inbox (Mailpit): http://127.0.0.1:55424
