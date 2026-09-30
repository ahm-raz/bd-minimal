# Plan: sell Client Acquisition OS to several offices and agencies

**Status:** proposal, not started. Written 2026-09-30.
**Decisions:** all made, see section 9.

---

## 0. The requirement (confirmed by you)

- **Every office is independent.** Each office has its own founder, its own staff, and its own leads, settings, tasks, feed and numbers.
- **One office's data is never visible to another office.** No staff member, report, search, notification or live update may cross offices.
- **A person belongs to one office only.**

Both routes below meet this requirement. In Route A the offices are separated by having separate databases. In Route B the database itself blocks access across offices, and tests prove it.

## 1. The short answer

Today the app is built for **one company**. The database allows exactly one founder, and the first person to sign up becomes that founder. Every lead, setting and number belongs to "the" company.

To sell it to many agencies you have two routes:

| | **Route A: one copy per customer** | **Route B: one shared app, many companies** |
|---|---|---|
| What it means | Each agency gets its own Supabase project and its own Vercel site | One app, one database. Every row belongs to a company, and the database keeps each company's rows separate |
| Code changes | Almost none | Large: every table, rule, metric and test |
| Time to first sale | Days | About 4–6 weeks of focused work |
| Cost per customer | A paid Supabase project each (roughly $25+/month; check current pricing) | Close to zero per extra customer |
| Updates | Push each migration to every copy by hand | Deploy once, everyone gets it |
| Good for | First 1–5 customers | 5+ customers, self-serve sign-up, trials |

**Recommendation: do both, in order.**
1. **Now:** sell to your first 2–3 agencies with Route A. You get paid, get feedback, and learn what they actually need.
2. **In parallel:** build Route B. Once it is ready, move the Route A customers onto it.

Don't build billing, self-serve sign-up or subdomains until paying customers ask for them.

---

## 2. Phase 0: get ready to sell (1 week, no big code changes)

Do these whatever route you pick.

- [ ] **Rotate the leaked keys.** `docs/DEPLOY.md` step 0 says the database password and service-role key were pasted into a chat. Confirm this is done before any customer data goes in.
- [ ] **Your own email sender for auth.** Supabase's built-in email sender only allows a few emails per hour, which isn't enough for invites and password resets. Set up custom SMTP (Resend, Postmark or SES) in Supabase → Auth → SMTP.
- [ ] **Google Calendar approval.** The calendar sync (M11) uses a Google sign-in app. Until Google verifies it, it works only for test users you add by hand and shows an "unverified app" warning. Start Google's verification now, because it takes weeks. You'll need the privacy page (`/privacy`, already there), a terms page and a short demo video.
- [ ] **Legal pages:** terms of service and a data processing agreement (DPA) template. Agencies store their clients' personal data, so they will ask for these.
- [ ] **Backups:** turn on daily backups (Supabase Pro), and point-in-time recovery if a customer needs it.
- [ ] **Product name and branding** in one place: app name, logo and favicon. Today the name "Client Acquisition OS" is written into the code in several places.
- [ ] **Demo site:** a separate Supabase and Vercel copy filled by `pnpm cloud:seed`, with a demo founder and a demo BD login to use on sales calls.
- [ ] **Pricing** (your decision). A simple start: a flat monthly fee per company that includes N seats, plus a fee per extra seat. Invoice by hand at first; you don't need Stripe yet.

### Route A runbook (per new customer, about 1 hour)

Write this into `docs/DEPLOY.md` as a repeatable checklist:

1. Create a Supabase project (in the region nearest the customer), then `supabase link` and `supabase db push`.
2. Set the auth settings: site URL, redirect URLs, sign-up off, custom SMTP.
3. Create a Vercel project from the same GitHub repo, with that customer's environment variables and domain (for example `acme.yourproduct.com`).
4. Open `/setup` and create the customer's founder account, or send them the link.
5. Add their Google Calendar redirect URL to the Google sign-in app.
6. Record the customer in a simple sheet: project ref, domain, plan, seats, renewal date.

**When you release an update**, run `supabase db push` against every customer's project, then redeploy. A small script that loops over the project refs will save mistakes. This is the main pain of Route A, and why it stops scaling at around 5 customers.

---

## 3. Phase 1: shared database with companies (Route B)

> **The spec for this phase is now `docs/11-offices.md`, and it wins where this section differs.** Differences: companies are called **offices** (`offices`, `office_id`, `current_office_id()`); a new member's office comes from a `pending_members` reservation rather than app metadata; there is no read-only mode yet, only suspend.

This is the core change. The spec currently lists multi-tenancy as out of scope (`CLAUDE.md`, `docs/01`), so **update the spec first**:
- `docs/01`: product scope
- `docs/02`: the new `organizations` table and the company column
- `docs/03`: who can see what across companies
- `docs/08`: new milestones

### 3.1 Data model

- **New table `organizations`:** id, name, slug, default time zone, plan, seat limit, status (`trial`, `active`, `past_due`, `cancelled`), trial end date, created at.
- **`profiles.organization_id`** (required). One person belongs to one company. This keeps login simple: the company comes from the profile, and there's no company switcher.
- **Every business table** gets `organization_id uuid not null default current_org_id() references organizations`. That's all ~30 tables: leads, contacts, activities, opportunities, tasks, targets, settings lists, posts, meetings, notifications, feed events, import batches, and so on.
- **Change these uniqueness rules so they apply within each company, not across the whole database:**
  - `profiles_single_founder` becomes one founder per company: unique on `(organization_id)` where role = founder.
  - List names (niches, sources, channels, campaigns, content pillars, and so on) become unique on `(organization_id, name)`.
  - Import batch `code` becomes unique on `(organization_id, code)`.
  - Stage and outcome `key` become unique on `(organization_id, key)`.
- **Hard-coded default `Asia/Karachi`** becomes the company's default time zone.

### 3.2 Security (RLS). This is the risky part

- Add a helper `current_org_id()` (security definer, stable) that reads the caller's profile.
- **Every policy** gets `organization_id = current_org_id()` added, next to the role checks it already has.
- **Every `security definer` function skips RLS**, so each one must filter by company itself. That includes `log_activity`, the `metrics_*` functions, `pipeline_summary`, `active_mrr`, `tasks_with_progress`, search, lead import and the feed and notification triggers. **Go through each one by hand.** One missed filter leaks one agency's numbers to another agency.
- `is_founder()` stays as it is, because it already checks only the caller's own profile, and that profile now carries a company.
- **Triggers** that insert rows (feed events, notifications, stage history, task auto-complete) must copy `organization_id` from the source row. Don't rely on the column default, because triggers can run with no logged-in user.
- **Realtime:** the feed subscription already goes through RLS. Test that company A's founder never receives company B's events.

### 3.3 Sign-up and invites

- **Replace "first user becomes founder"** in `handle_new_user()`:
  - The company id and role are set in **`raw_app_meta_data`** (only the server can write this) by the server action that creates the user.
  - Never read them from user metadata, because users can edit that. The current code already follows this rule; keep it.
- **Creating a company** (`create_organization(name, founder_email)`): inserts the organization, invites the founder, and **fills in default settings**: stages with probabilities, activity types, outcomes, lost reasons and starter lists. Today they're inserted once at the end of `20260924000000_init.sql`, plus the hidden "CSV import" source in the lead-import migration. Move them into this function. Stages and outcomes have a `key` the code relies on, so every company must get the same keys.
- **The founder invites BDs and SMMs** exactly as now. The invite action puts the founder's company id into app metadata.
- **`/setup`** becomes a **platform-owner-only** "create company" screen (section 3.4). Later, if you want self-serve, add a public sign-up page.

### 3.4 Platform owner (you)

- Add a new flag, `profiles.is_platform_admin` (or a separate table), not a new company role.
- Add a small `/admin` area: list of companies, seats used, last activity, status. Actions: create company, suspend or reactivate, extend trial.
- This area needs the service-role key. **Update CLAUDE.md rule 3** so it allows two uses: founder actions within their own company, and platform-admin actions. Each use must check the caller first.
- **Suspended company:** RLS returns nothing and the app shows "Your account is paused. Contact us."

### 3.5 Limits

- **Seat limit:** add a database trigger on profiles that refuses a new active user when the company is at its limit. The invite dialog shows the error inline.
- **Read-only when unpaid:** when status is `past_due` or `cancelled`, writes are blocked (add a check in the write policies) but data can still be viewed and exported.

### 3.6 Move existing data

- In the same migration, create the current company as organization #1 and set it on every existing row. Then make the column required (not null).
- Route A customers move over later with a script: export from their project, then import into their new organization with fresh ids. Test this on a copy first.

### 3.7 Tests (the "done" check for this phase)

- **SQL smoke tests** (`supabase/tests/`): for every table and every security-definer function, a user in company A sees 0 rows from company B, and cannot insert, update or delete them.
- **E2E:** seed two companies. Each founder sees only their own team, leads, feed, performance numbers and notifications. A BD from company A who opens a company B lead URL gets "not found".
- **Every existing test** must still pass with a single company.
- **Seed scripts** (`seed:demo`, `seed:more`, `test-users`) get a flag for which company to fill.

---

## 4. Phase 2: running it as a business (after Phase 1)

Add these only when customers need them:

- **Billing:** Stripe Checkout, the customer portal and a webhook that updates `organizations.status` and `seat_limit`. This adds a library, so note the reason in the commit (CLAUDE.md asks for that).
- **Self-serve sign-up and free trial:** a public page that creates the company and its founder, with a 14-day trial.
- **Data export:** the founder downloads all leads, contacts and activities as CSV. Agencies ask for this before they sign ("can we leave with our data?").
- **Deleting a cancelled company:** after N days, remove all of its rows. Needed for privacy law, and for trust.
- **Company settings page:** name, logo, default time zone.
- **Custom domains or subdomains per company:** only if a customer pays for white-label. Otherwise everyone uses one address like `app.yourproduct.com`.
- **Monitoring:** error tracking, uptime checks on `/healthz`, and a weekly look at slow queries once many companies share the database.

---

## 5. What does NOT change

- The roles inside a company: founder, BD and SMM, and what each can do.
- All screens, metrics definitions and business rules (docs 04–07, 09, 10). They now work per company.
- The stack. Only Stripe is added, and only in Phase 2.
- USD only. Out-of-scope items stay out unless a paying customer asks for one.

---

## 6. Suggested milestones (to add to `docs/08-build-plan.md`)

| # | Milestone | Done when |
|---|---|---|
| M13 | Spec update | docs 01/02/03/08 and CLAUDE.md say "many companies"; you've signed off |
| M14 | Organizations + column on every table + backfill | Migration applies on a copy of production; all existing tests pass |
| M15 | RLS + security-definer functions scoped by company | Cross-company SQL tests pass for every table and function |
| M16 | Create company, default settings, invites carry company | Two companies created from `/admin`, each with its own founder and BDs |
| M17 | Platform admin, suspend, seat limit, read-only when unpaid | E2E: suspended company can't load data; seat limit blocks invite with an inline error |
| M18 | Two-company E2E + seed scripts + deploy runbook | Full E2E green with two companies; production migrated |
| M19+ | Billing, self-serve, export, deletion | As customers need them |

Rough effort: M13–M18 is about 4–6 weeks for one developer working with Claude. M15 is the biggest and riskiest.

---

## 7. Risks

| Risk | What protects you |
|---|---|
| One agency sees another agency's data | Company filter in RLS **and** in every security-definer function, plus a cross-company test for each one |
| A migration breaks the live data | Take a backup first, run the migration on a copy of production first, and use point-in-time recovery |
| Google blocks calendar sync for new customers | Start Google's verification in Phase 0 |
| Invite emails land in spam or hit the rate limit | Custom SMTP with a proper domain setup (SPF, DKIM) |
| Route A copies drift apart | A script pushes migrations to every copy, and you move them to Route B early |
| One busy company slows down the others | Indexes that start with `organization_id` on large tables (leads, activities, feed events) |

---

## 8. Order to do things this week

1. Confirm the keys are rotated. Set up custom SMTP. Start Google verification.
2. Set prices for the Standard and Dedicated plans (section 9).
3. Build the demo site.
4. Onboard customer #1 with the Route A runbook.
5. Start M13 (spec update) for Route B.

---

## 9. Decisions (all made, 2026-09-30)

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Route | **Route A first (one copy per office), then Route B (shared app).** Move Route A offices onto Route B once M18 is done. | Sell and get paid within days; build the shared app without rushing the security work. |
| 2 | One person in several offices? | **No.** Each person belongs to one office. | Offices are independent; keeps login and privacy simple. |
| 3 | How offices sign up | **You create each office by hand** from the `/admin` page (M16–M17), then invoice by hand. No public sign-up page, trial or Stripe until there are about 10 paying offices or they ask to pay by card. | Sales-led is enough for the first offices and removes billing work from Phase 1. |
| 4 | Branding | **One product brand for everyone**, at one address (e.g. `app.yourproduct.com`). Each office's **name** shows in the sidebar and in invite emails. Office logo upload comes in Phase 2 (company settings page). Full white-label (own domain, own colours) only as a paid extra if someone asks. | One brand keeps one Google app, one email sender and one deploy. |
| 5 | Where data lives | **One region for the shared app**, the one nearest most of your offices. An office that legally needs another region (e.g. EU) gets its own Route A copy in that region, priced higher. | Route A stays available as the "dedicated" plan, so no office is turned away. |

### What this means for the milestones

- **M16:** `/admin` → "Create office" (name, time zone, founder email, seat limit) is the only way to create an office. `/setup` is removed from the shared app.
- **M17:** the office name is shown in the sidebar header and used in invite emails.
- **Phase 2 order:** data export → deleting cancelled offices → office logo → billing and self-serve sign-up (only when triggered as above).
- **Pricing tiers:** *Standard* (shared app) and *Dedicated* (own Route A copy, own region, higher price).
