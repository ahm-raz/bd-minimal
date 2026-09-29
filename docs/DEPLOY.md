# Deploying Client Acquisition OS

This guide sets the app up on three services:
- **GitHub** holds the code.
- **Supabase Cloud** runs the database and auth.
- **Vercel** hosts the web app.

Do the steps in order. Commands run in **PowerShell** from `D:\bd-minimal`.

Values used below:

| Name | Value |
|---|---|
| Supabase project ref | `puxqrtmnqkrragowssca` |
| Supabase URL | `https://puxqrtmnqkrragowssca.supabase.co` |
| Your app URL | `https://<your-app>.vercel.app` (you get it in step 4) |

> **Never put keys or passwords in files that get committed.**
> - `.env.local` is already git-ignored.
> - Keys go only into the Vercel dashboard (step 4).

---

## 0. Secure the keys first

The database password, service role key and secret key were pasted into a chat. Treat them as leaked and replace them.

1. **Database password.** Supabase → Project Settings → Database → **Reset database password**. Save the new one in a password manager.
2. **API keys**, in Supabase → Project Settings → **API Keys**:
   - Roll the **legacy JWT secret**. This gives a new `anon` and `service_role` key.
   - Delete or roll the `sb_secret_…` key.
3. Use the **new** values in the rest of this guide.

The app uses the **anon** key (public) and the **service_role** key (server only). You don't need the `sb_publishable_…` or `sb_secret_…` keys.

---

## 1. Put the code on GitHub

```powershell
git status                      # review what will be committed
git add -A
git commit -m "Dev reset scripts, BD walkthrough diagrams, deploy guide"
gh repo create client-acquisition-os --private --source . --push
```

Check the result:
- The repo page shows the code.
- `.env.local` is **not** in it.

---

## 2. Create the database on Supabase

```powershell
pnpm supabase login                                           # opens the browser once
pnpm supabase link --project-ref puxqrtmnqkrragowssca         # asks for the NEW database password
pnpm supabase migration list                                  # shows 3 local migrations, none remote yet
pnpm supabase db push                                         # applies the 3 migrations; type Y to confirm
pnpm supabase migration list                                  # all 3 now show on both sides
```

The migrations are:
- `20260924000000_init.sql`
- `20260925000000_social_enums.sql`
- `20260925000100_social_module.sql`

Rules for this database:
- **Don't** run `supabase config push`. It would copy the local settings (localhost URLs) to the cloud.
- **Don't** run `pnpm seed:demo`, `pnpm dev:reset` or `pnpm dev:reset-lead` against it. They refuse anything that isn't local anyway.
- The cloud database starts **empty**. Local test data doesn't move over.

---

## 3. Set up email (so invites and password resets arrive)

Supabase's built-in email sender allows only a few emails per hour, and only to your Supabase team members. For real BDs, use your own sender.

### Option A: Resend (free tier)
1. Create an account at resend.com.
2. **Domains → Add domain.** Add the DNS records it shows at your domain registrar and wait until the domain is "Verified".
3. **API Keys → Create.** Copy the key.
4. Supabase → Authentication → **Emails → SMTP Settings** → Enable custom SMTP:

   | Setting | Value |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | the Resend API key |
   | Sender email | e.g. `no-reply@yourdomain.com` (on the verified domain) |
   | Sender name | `Client Acquisition OS` |

### Option B: no domain yet
Skip this section. Invites then work only for emails that are members of your Supabase organization. That's enough to test, but not for the real team.

### Email templates (do this with either option)
In Supabase → Authentication → **Emails → Templates**, replace the message body of two templates with the files from this repo. The links in these templates go to `/auth/confirm`, which the app needs.

| Supabase template | File to paste |
|---|---|
| **Invite user** | `supabase/templates/invite.html` |
| **Reset password** | `supabase/templates/recovery.html` |

---

## 4. Deploy the app on Vercel

1. vercel.com → sign up **with GitHub**, then **Add New → Project** and import `client-acquisition-os`.
2. Leave the defaults:
   - Framework: **Next.js** (it detects pnpm by itself).
   - Build command: `pnpm build`.
   - Root directory: `./`.
3. **Environment Variables.** Add these four, for all environments:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://puxqrtmnqkrragowssca.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the **new** anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | the **new** service_role key (secret) |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-app>.vercel.app` (enter your best guess of the project name; fix it after the first deploy) |

4. Click **Deploy** and wait about 2 minutes. Note the real URL, e.g. `https://client-acquisition-os.vercel.app`.
5. If `NEXT_PUBLIC_SITE_URL` doesn't match the real URL:
   - Settings → Environment Variables → edit it.
   - **Deployments → ⋯ → Redeploy.** `NEXT_PUBLIC_` values are baked in at build time, so a redeploy is required.
6. Optional: under Settings → **Functions → Region**, pick the region closest to your Supabase project, e.g. Mumbai `bom1`. This makes pages faster.
7. Optional custom domain:
   - Settings → **Domains** → add `crm.yourdomain.com` and follow the DNS steps.
   - Then set `NEXT_PUBLIC_SITE_URL` to that domain, redo step 5, and use the domain in step 5 below.

---

## 5. Point Supabase auth at the app

Supabase → Authentication → **URL Configuration**:

| Setting | Value |
|---|---|
| **Site URL** | `https://<your-app>.vercel.app` |
| **Redirect URLs** (add each) | `https://<your-app>.vercel.app/accept-invite`<br>`https://<your-app>.vercel.app/reset-password`<br>`https://<your-app>.vercel.app/auth/confirm` |

---

## 6. First run

1. Open `https://<your-app>.vercel.app/healthz`. It should respond OK.
2. Open `https://<your-app>.vercel.app/setup` and create the **founder** (Zain): name, email, password of 10+ characters.
   - You land on My Day.
   - `/setup` now returns 404 forever. Only the first account can use it.
3. **Turn off public sign-ups:** Supabase → Authentication → **Sign In / Providers** → turn off "Allow new users to sign up". Invites still work.
4. As the founder, go to **Team → Invite member** and invite each person:
   - **Ahmed:** role **BD**, primary niche **Dental**.
   - **Hina:** role **Social media manager**.
5. Each invitee:
   - gets an email and clicks the link;
   - lands on `/accept-invite` and sets a password;
   - is taken to My Day.
6. As the founder, set up **Settings** (niches, channels, campaigns, targets, social accounts, pillars) the way you want.

---

## 7. Smoke test (about 10 minutes)

| As | Check |
|---|---|
| Founder | My Day loads; Team shows 3 members; Settings tabs open |
| BD (Ahmed) | Add a lead (`N`), log an activity (`L`); the status changes to Contacted; My Day shows Outreach 1 |
| Founder | Feed shows Ahmed's activity live; Leads → All shows the lead |
| BD | `/team` redirects with "That page is for the founder." |
| SMM (Hina) | Content opens; `/leads` redirects with "That page isn't part of your role." |
| Anyone | Profile → Reset password email arrives and the link works |

---

## 8. Updating later

- **Code change:**
  - `git push`. Vercel redeploys `main` automatically.
  - Pushes to other branches get preview URLs.
- **Database change:**
  - Add a **new** file in `supabase/migrations/`; never edit an applied one.
  - Test locally (`pnpm db:reset`, `pnpm db:test`, `pnpm test:e2e`).
  - Then run `pnpm supabase db push`, then `git push`.
- **Backups:** Supabase free tier has limited backups. On a paid plan, turn on daily backups or point-in-time recovery before real data piles up.

## 9. Meetings, notifications and Google Calendar (M11)

1. Apply the three M11 migrations to the cloud database: `pnpm supabase db push` (it lists what it will apply; say yes). Do this **before** pushing the code.
2. Google Cloud (done once, project `client-acquisition-os-510114`): Calendar API on; OAuth consent screen External, scope `calendar.events.owned`, published; web client with redirect URIs `http://localhost:3000/api/google/callback` and `https://bd-minimal.vercel.app/api/google/callback`. Branding uses `https://bd-minimal.vercel.app/privacy`.
3. Vercel → Project → Settings → Environment Variables (Production), then redeploy:
   - `GOOGLE_CALENDAR` = `on`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (from the downloaded client JSON)
   - `GOOGLE_TOKEN_KEY`: 32 random bytes, base64. Use a **new** value for production (don't reuse the local one).
   - Check `NEXT_PUBLIC_SITE_URL` is `https://bd-minimal.vercel.app` (the Google redirect is built from it).
4. Each person: Profile → **Connect Google Calendar**. Google says it hasn't verified the app: **Advanced** → **Go to Client Acquisition OS**.
5. Changing `GOOGLE_TOKEN_KEY` later makes stored tokens unreadable: everyone sees **Reconnect**.

Notifications need nothing extra: they use Supabase Realtime, which is already on.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails on Vercel with missing env | Check all 4 variables exist for the environment being built (Production and Preview) |
| Invite link opens but says the link is invalid or expired | Redirect URLs (step 5) are missing or wrong; the Site URL must match the app URL exactly (https, no trailing slash) |
| Invite email links go to `localhost` | `NEXT_PUBLIC_SITE_URL` or the Supabase Site URL is still localhost; fix it and **redeploy** |
| No invite email arrives | SMTP isn't set (step 3) or the domain isn't verified; check Supabase → Logs → Auth |
| "Email rate limit exceeded" | You're on the built-in sender; set up custom SMTP (step 3) |
| `/setup` shows 404 on a fresh deploy | A user already exists; sign in with it, or delete it in Supabase → Authentication → Users and retry |
| Pages load but show no data | The anon key belongs to another project, or the migrations weren't pushed (`pnpm supabase migration list`) |
| `supabase link` asks for a password and fails | Use the database password (step 0), not an API key |
