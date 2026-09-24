# Progress

**Status:** M2 done. Next: M3 (leads).

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
- [ ] Zod schemas + normalisers with exhaustive tests
- [ ] lib/completeness.ts equals DB on 10 fixtures
- [ ] Add/edit lead panel (8 sections, reach rule, paste helpers, meter, duplicate notice)
- [ ] Leads list (table, column visibility, search, URL filters, views, bulk actions)
- [ ] Lead page (header, contacts CRUD, details, ownership history, reassign, delete)

### M4: Activities + My Day
- [ ] Log activity panel via log_activity
- [ ] Opportunity / proposal prompts; 24h BD edit window
- [ ] Lead timeline with filter chips
- [ ] My Day: pace bars, follow-ups, coming up, empty states
- [ ] Shortcuts N, L, /, G M/L/P, Esc
- [ ] e2e: status transitions; Berlin overdue logic; backdating limit

### M5: Pipeline
- [ ] dnd-kit board, Won/Lost dialogs, optimistic + rollback
- [ ] Opportunity side panel with history, list view, lead page stage dropdown, owner filter
- [ ] e2e: won/lost flows; reassign moves open opp only

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

## Deviations
- Supabase CLI: `[auth.email] enable_signup` also switches off email *sign-in*, so it stays `true`; public sign-up is disabled with the top-level `[auth] enable_signup = false` (verified: /auth/v1/signup returns signup_disabled).
- `typecheck` runs `next typegen` first, because Next 16 route types (PageProps/LayoutProps) are generated.
- Next dev indicator turned off (next.config.ts): it covered the sidebar user menu.
- Next.js 16.3 scaffold; `create-next-app` refuses names starting with a dot, so the scaffold used `tmp-app` instead of `.tmp-app`.
- Next.js 16 renamed middleware to proxy: route guards live in src/proxy.ts.
- shadcn 4.x generated components import `cn` from the `cn` package and use `radix-ui`; next-themes was removed (light only).
- Vitest config is vitest.config.mts (ESM).
- shadcn 4.x no longer ships the `form` component; `field` was added instead and forms use react-hook-form directly with it.

## Known issues
- none yet

## How to run
```bash
pnpm install
pnpm db:start        # local Supabase in Docker
pnpm dev             # http://localhost:3000
```
- App: http://localhost:3000
- Supabase Studio: http://127.0.0.1:55423
- Email inbox (Mailpit): http://127.0.0.1:55424
