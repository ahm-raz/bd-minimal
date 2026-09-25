# Client Acquisition OS

A small internal CRM for one founder and a team of business developers (BDs): detailed leads,
logged outreach, a pipeline, daily tasks, a live feed and performance numbers.

The spec lives in [`docs/`](docs/) (start with [`CLAUDE.md`](CLAUDE.md)); build progress and decisions are in
[`docs/PROGRESS.md`](docs/PROGRESS.md).

## Prerequisites

- **Node.js** 20.9 or later (22 recommended)
- **pnpm** 10 (`corepack enable` if `pnpm` is missing)
- **Docker Desktop**, running (local Supabase runs in containers)
- Git

The Supabase CLI is a dev dependency; call it with `pnpm supabase …`. `psql` is optional.

## Setup from a fresh clone

```bash
pnpm install
pnpm exec playwright install chromium   # only needed for e2e tests and screenshots

pnpm db:start        # start local Supabase and apply the migration
pnpm supabase status -o env              # shows API_URL, ANON_KEY, SERVICE_ROLE_KEY
```

Create `.env.local` (copy `.env.example`) from that output:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55421
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Then either load demo data:

```bash
pnpm db:reset && pnpm seed:demo
pnpm dev
```

or start empty and create the founder at <http://localhost:3000/setup> (this page only works while
no user exists).

## Demo logins

After `pnpm seed:demo`, every account uses the password `demo-password-123`:

| Email | Role | Time zone |
|---|---|---|
| zain@example.com | Founder | Asia/Karachi |
| ahmed@example.com | BD (Dental) | Asia/Karachi |
| sara@example.com | BD (Law) | Asia/Karachi |
| bilal@example.com | BD (AI SaaS) | Europe/Berlin |

## Local URLs

| What | URL |
|---|---|
| App | <http://localhost:3000> |
| Supabase Studio | <http://127.0.0.1:55423> |
| Email inbox (Mailpit: invites, password resets) | <http://127.0.0.1:55424> |
| Supabase API | <http://127.0.0.1:55421> |

This project's Supabase uses ports **55420–55429** (see `supabase/config.toml`) so it can run next to
another local Supabase project on the default 5432x ports.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Run the app on port 3000 |
| `pnpm build` / `pnpm start` | Production build / serve it |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier (with the Tailwind plugin) |
| `pnpm typecheck` | Generate Next route types, then `tsc --noEmit` |
| `pnpm test` | Vitest unit tests (dates, formats, normalisers, completeness vs the database, metrics) |
| `pnpm test:e2e` | Playwright end-to-end tests (resets the local database first; one worker) |
| `pnpm db:start` / `pnpm db:stop` | Start / stop local Supabase |
| `pnpm db:reset` | Recreate the local database from `supabase/migrations` |
| `pnpm db:types` | Regenerate `src/lib/database.types.ts` |
| `pnpm db:test` | SQL smoke test (`supabase/tests/02_smoke_test.sql`) against local Supabase; fails on any missing value |
| `pnpm seed:demo` | Demo team and ~200 leads (refuses unless Supabase is local and empty) |
| `pnpm screenshots [page …]` | Capture pages at 1440×900 as founder and BD into `./screenshots/` |

## Running the tests

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm db:test && pnpm test:e2e && pnpm build
```

- `db:test` and `test:e2e` both reset the local database. Run `pnpm seed:demo` again afterwards if
  you want the demo data back.
- e2e tests read invite and reset emails from Mailpit and fail on any browser console error.
- The e2e suite starts `pnpm dev` itself if nothing is running on port 3000.

## Keyboard shortcuts

- `N` new lead
- `L` log activity (on a lead page, or the focused My Day row)
- `T` new task (founder)
- `/` search leads
- `Ctrl/Cmd+K` command menu
- `G` then `M`, `L` or `P`: My Day, Leads or Pipeline
- `Esc` close a panel

## Deploying (not done here)

Vercel for the app and Supabase Cloud for the database: run the migration, set the Site URL and
redirect URLs (`/accept-invite`, `/reset-password`), copy the invite and recovery email templates from
`supabase/templates/` (their links go to `/auth/confirm`), create the founder via `/setup`, then turn off
public sign-ups.
