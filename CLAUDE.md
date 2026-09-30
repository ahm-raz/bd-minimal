# Client Acquisition OS — v1

A small CRM for offices and agencies. Each office has one founder and a team of business developers (BDs).
BDs add detailed leads every day, log their outreach, and move deals through a pipeline.
The founder watches the work live, assigns daily tasks, and reviews performance.

Many independent offices in one app: each office's staff and data are private to that office, enforced by the database. A separate platform owner account manages offices on `/admin`. Laptop-first web app. USD only.

## Read before writing code

**`docs/APP-GUIDE.md` is the spec.** It is one file with every role, screen, table, rule, metric and flow, plus diagrams, build history, setup, testing and deploy. Read the sections that touch your change before writing code:

- **Sections 1–3:** overview, roles and permissions, the office boundary. Always read these.
- **Sections 4–10:** auth flows, data model, business rules, metrics, screens, user journeys, request flow.
- **Sections 11–13:** design system, build history and progress, setup, commands and deploy.
- **Section 15:** known differences between the older doc text and the code.

The database is `supabase/migrations/*.sql`, applied in filename order; the latest definition of a function wins.

The guide is the spec. If code and the guide disagree, the guide wins, unless section 15 records the difference as still to decide. If the guide is unclear or contradicts itself, stop and ask. Don't guess.

## Stack

- Next.js (latest stable, App Router, Server Components, Server Actions), TypeScript `strict`
- Supabase: Postgres, Auth (email + password, invites), Row Level Security, Realtime
- `@supabase/ssr` for auth cookies in Next.js
- Tailwind CSS + shadcn/ui (Radix primitives), lucide-react icons
- TanStack Table (lists), dnd-kit (pipeline board), Recharts (charts)
- React Hook Form + Zod (forms; one Zod schema per form, shared by client and server)
- libphonenumber-js (phones), date-fns + @date-fns/tz (dates and time zones)
- sonner (toasts), cmdk (global search / command menu)
- Vitest (unit), Playwright (end-to-end)
- pnpm. Deploy: Vercel + Supabase Cloud.

Don't add other libraries without a clear reason written in the PR/commit message.

## Commands

```bash
pnpm dev                     # run app
pnpm lint && pnpm typecheck  # must pass before a milestone is done
pnpm test                    # vitest
pnpm test:e2e                # playwright
supabase start               # local Supabase (Docker)
supabase db reset            # re-apply migrations to the local DB
supabase gen types typescript --local > src/lib/database.types.ts
pnpm seed:demo               # two demo offices + owner@example.com (local; cloud:seed for cloud)
pnpm db:test                 # SQL tests (supabase/tests/02..07)
pnpm owner:add <email>       # create a platform owner (--cloud, --reset)
```

## Project layout

```
src/
  app/
    (auth)/login, (auth)/accept-invite, (auth)/reset-password
    (app)/layout.tsx          # sidebar shell, role-aware nav
    (app)/my-day
    (app)/leads, (app)/leads/[id]
    (app)/pipeline
    (app)/content             # posts and schedules (founder, SMM)
    (app)/performance
    (app)/tasks
    (app)/feed                # founder only
    (app)/team                # founder only
    (app)/settings/...        # founder only
    (app)/profile
    (app)/notifications, (app)/leads/import, (app)/settings/office
    (owner)/layout.tsx, (owner)/admin   # platform owner only: offices (APP-GUIDE §8)
    (auth)/setup              # first install: first office + founder
  components/ui/              # shadcn components (generated)
  components/<feature>/       # feature components
  lib/supabase/{browser,server,admin}.ts
  lib/validation/             # zod schemas
  lib/dates.ts                # time-zone helpers (APP-GUIDE §6, time zones)
  lib/format.ts               # money, percent, relative dates
  lib/database.types.ts       # generated
  server/actions/             # server actions, one file per feature
supabase/migrations/          # SQL only; never edit an applied migration
supabase/tests/               # SQL smoke tests
scripts/seed-demo.ts, scripts/second-office.ts, scripts/platform-owner.ts
docs/APP-GUIDE.md             # the whole spec and guide (keep it current, rule 12)
```

## Rules

1. **Build in milestone order** from the build plan in `docs/APP-GUIDE.md` section 12. Finish a milestone's checklist before starting the next. After each one, update the progress part of section 12 (the status table and the milestone's checklist) with what's done and anything skipped.
2. **Security lives in the database.** RLS decides what each user can see. App code never filters by owner "for safety" instead of RLS. It may filter for UX, e.g. the founder's "BD" dropdown.
3. **The service-role key is used only in `src/lib/supabase/admin.ts`,** and only from server actions that first check the caller: a founder (for members of their own office: adding, inviting, deactivating (ban) and reactivating) or the platform owner (creating a new office's founder), plus `/setup` while no office exists. Nothing else. See `docs/APP-GUIDE.md` section 3.
4. **Business rules already exist in SQL triggers.** Automatic lead status, stage history, count-task completion, the activity feed and completeness are done by the database. Don't re-implement them in TypeScript. Call `log_activity()` to log activities.
5. **Numbers come from the metric functions** in the migration (`metrics_scoreboard`, `metrics_by_dimension`, `metrics_daily`, `pipeline_summary`, `active_mrr`, `tasks_with_progress`). Don't compute KPIs in the browser from raw rows.
6. **Schema changes go in a new migration file.** Regenerate types after every change.
7. **Office boundary.** Every row belongs to one office. The restrictive `office_boundary` policy and the `office_definer` role keep every query and `security definer` function inside the caller's office; only the reviewed postgres-owned functions (APP-GUIDE §3, checked by `supabase/tests/07_offices_test.sql`) may look across offices, and never return office data to members.
8. **No scope creep.** Anything in "Out of scope" (`docs/APP-GUIDE.md` section 1) stays out, even if it seems small.
9. **UI copy** follows the design system (`docs/APP-GUIDE.md` section 11): sentence case, plain verbs, buttons say what they do.
10. **Dates:** store timestamps in UTC; turn them into "today" or "this week" using the viewer's profile time zone (`docs/APP-GUIDE.md` section 6, time zones and dates).
11. **Every form** validates with Zod on the client and again in the server action. Show field errors inline, not only in a toast.
12. **Keep docs/APP-GUIDE.md current.** Any change to a route, table, migration, RLS policy, trigger, metric function, role, business rule, server action or screen must update the matching section and diagrams of docs/APP-GUIDE.md in the same change. Update the "Last updated" line at the top. A task is not done until the guide matches the code.
