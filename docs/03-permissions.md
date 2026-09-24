# 03 — Permissions and access

## 1. Principle

Row Level Security (RLS) in Postgres is the only security boundary. The UI hides things a user can't do, but hiding is for comfort, not safety. Every rule below is already enforced by the migration and checked by `supabase/tests/02_smoke_test.sql`.

## 2. Matrix

| Data | BD | Founder |
|---|---|---|
| Own profile | read; edit name and time zone | read and edit everything |
| Other profiles | read names only (for display) | read and edit; invite, deactivate, reactivate |
| Settings lists, campaigns | read | add, edit, hide |
| Outcome labels, stage labels and probabilities | read | rename; change probability |
| Targets | read own | read all; set |
| Leads and contacts | own leads only: create, read, edit | all: create, read, edit, delete, reassign |
| Lead delete | no (use Bad fit / Not interested) | yes |
| Activities | on own leads: log, read, edit own | all; delete |
| Opportunities | own: create, read, move, edit | all; delete |
| Stage and ownership history | own | all |
| Tasks | read own; tick own checklist and lead-fix tasks | create, edit, delete, read all |
| Task templates | none | all |
| Feed | none | all |
| Metrics | own row only | everyone |

Notes:
- A BD cannot create a lead owned by someone else, or change a lead's owner.
- A BD cannot change anything on a task except its completion, and cannot complete count tasks by hand.
- The founder can have their own leads, tasks and targets, like a BD.
- A deactivated user can read nothing, even with a valid session.

## 3. Auth flows

### First setup (founder)
1. Create the Supabase project. In **Auth → Providers → Email**, disable "Allow new users to sign up" after step 3.
2. Run migrations.
3. The founder signs up once (a dev-only `/setup` page, or the Supabase dashboard "Add user"). The trigger makes the first user the founder.
4. Disable public sign-up. From now on, users join only by invite.

`/setup` must refuse to work if any profile exists. Remove it or keep it behind that check.

### Invite a BD
1. Founder fills the Invite form: name, email, niche, time zone.
2. A server action checks the caller is the founder, then calls `auth.admin.inviteUserByEmail(email, { data: { full_name }, redirectTo: <site>/accept-invite })` with the admin client.
3. The trigger creates the profile with role `bd`.
4. The action then updates that profile with niche and time zone, using the admin client.
5. The BD opens the email link, sets a password on `/accept-invite`, and lands on `/my-day`.
6. Until they finish step 5, Team shows them as **Invited** (auth user has no `last_sign_in_at`). The founder can resend the invite.

The role is never taken from user metadata, because users can edit their own metadata.

### Deactivate
1. The founder clicks Deactivate on a member.
2. A server action sets `profiles.is_active = false` and bans the auth user (`auth.admin.updateUserById(id, { ban_duration: '876000h' })`) so they can't sign in.
3. The action then opens the Reassign dialog for their open leads.
4. Reactivate reverses both (`ban_duration: 'none'`).

The founder cannot be deactivated or demoted; the database rejects it.

### Sessions
- `@supabase/ssr` middleware refreshes the session on every request.
- Middleware redirects signed-out users to `/login`.
- It redirects BDs away from founder-only routes (`/feed`, `/team`, `/settings/*`) to `/my-day`, and shows the toast "That page is for the founder."
- Load the profile once in the `(app)` layout. Pass the role and time zone down through a React context.

### Password reset
`/login` has "Forgot password?", which calls `resetPasswordForEmail` and sends the user to `/reset-password`.

## 4. Where the service-role key may be used

Only in `src/lib/supabase/admin.ts`, imported only by server actions that first confirm the caller is an active founder:

- invite and resend invite
- deactivate and reactivate (ban / unban)
- set niche and time zone on a newly invited profile

The key is never sent to the browser. It must not be prefixed `NEXT_PUBLIC_`.
