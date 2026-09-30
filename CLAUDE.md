# Client Acquisition OS — v1

A small CRM for offices and agencies. Each office has one founder and a team of business developers (BDs).
BDs add detailed leads every day, log their outreach, and move deals through a pipeline.
The founder watches the work live, assigns daily tasks, and reviews performance.

Many independent offices in one app (M13–M18, `docs/11-offices.md`): each office's staff and data are private to that office, enforced by the database. Laptop-first web app. USD only.

## Read before writing code

| File | What it answers |
|---|---|
| `docs/01-product-spec.md` | What we're building, for whom, what's in and out of v1 |
| `docs/02-data-model.md` | Every table and field, and why it exists |
| `docs/03-permissions.md` | Who can see and change what; login, invite, deactivate |
| `docs/04-business-rules.md` | Automatic statuses, tasks, follow-ups, validation, time zones |
| `docs/05-metrics.md` | Exact definition of every number on every screen |
| `docs/06-design-system.md` | Colors, type, spacing, components, UI copy rules |
| `docs/07-screens.md` | Every route: layout, fields, actions, states, acceptance checks |
| `docs/08-build-plan.md` | Milestones in order, with a checklist for each |
| `docs/09-social-media.md` | M10: Social media manager role and content scheduling |
| `docs/10-meetings-notifications.md` | M11: Meetings, Google Calendar sync and notifications |
| `docs/11-offices.md` | M13–M18: many offices in one app, the office boundary, platform admin |
| `supabase/migrations/20260924000000_init.sql` | The database. Tables, triggers, RLS, metric functions. Already tested. |

The docs are the spec. If code and docs disagree, the docs win. If the docs are unclear or contradict each other, stop and ask. Don't guess.

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
pnpm seed:demo               # demo team + sample data (local only, see build plan)
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
    (app)/admin               # platform admins only: offices (docs/11)
  components/ui/              # shadcn components (generated)
  components/<feature>/       # feature components
  lib/supabase/{browser,server,admin}.ts
  lib/validation/             # zod schemas
  lib/dates.ts                # time-zone helpers (see docs/04)
  lib/format.ts               # money, percent, relative dates
  lib/database.types.ts       # generated
  server/actions/             # server actions, one file per feature
supabase/migrations/          # SQL only; never edit an applied migration
supabase/tests/               # SQL smoke tests
scripts/seed-demo.ts
docs/
```

## Rules

1. **Build in milestone order** from `docs/08-build-plan.md`. Finish a milestone's checklist before starting the next. After each one, update `docs/PROGRESS.md` (create it) with what's done and anything skipped.
2. **Security lives in the database.** RLS decides what each user can see. App code never filters by owner "for safety" instead of RLS. It may filter for UX, e.g. the founder's "BD" dropdown.
3. **The service-role key is used only in `src/lib/supabase/admin.ts`,** and only from server actions that first check the caller: a founder (for members of their own office: adding, inviting, deactivating (ban) and reactivating) or a platform admin (creating a new office's founder). Nothing else. See `docs/11-offices.md` section 7.
4. **Business rules already exist in SQL triggers.** Automatic lead status, stage history, count-task completion, the activity feed and completeness are done by the database. Don't re-implement them in TypeScript. Call `log_activity()` to log activities.
5. **Numbers come from the metric functions** in the migration (`metrics_scoreboard`, `metrics_by_dimension`, `metrics_daily`, `pipeline_summary`, `active_mrr`, `tasks_with_progress`). Don't compute KPIs in the browser from raw rows.
6. **Schema changes go in a new migration file.** Regenerate types after every change.
7. **Office boundary.** Every row belongs to one office. Every policy and every `security definer` function filters by `current_office_id()`; nothing ever reads or counts across offices (`docs/11-offices.md`).
8. **No scope creep.** Anything in "Out of scope" in `docs/01-product-spec.md` stays out, even if it seems small.
9. **UI copy** follows `docs/06-design-system.md`: sentence case, plain verbs, buttons say what they do.
10. **Dates:** store timestamps in UTC; turn them into "today" or "this week" using the viewer's profile time zone (`docs/04-business-rules.md`, section 8).
11. **Every form** validates with Zod on the client and again in the server action. Show field errors inline, not only in a toast.
