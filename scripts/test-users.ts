/**
 * The three permanent accounts, nothing else.
 *
 *   pnpm dev:reset             LOCAL: erase everything, then create the three accounts
 *   pnpm cloud:reset           CLOUD: same, on the linked Supabase Cloud project
 *   pnpm cloud:users           CLOUD: keep all data; create the three accounts if missing and put their
 *                              email, password, name, role and time zone back to the originals
 *
 * Accounts (password demo-password-123, all Asia/Karachi):
 *   founder              Zain Malik   local zain@example.com   cloud zainfours@gmail.com
 *   BD (Dental)          Ahmed Khan   local ahmed@example.com  cloud ahmrazsal7@gmail.com
 *   social media manager Hina Raza    local hina@example.com   cloud ahmraz125@gmail.com
 * The default settings lists from the migrations (niches, channels, sources, stages, pillars…) stay.
 */
import { CORE_EMAILS, PASSWORD, adminClient, appUrl, createFirstOffice, reserveMember, resetDatabase, where } from "./target";

const ENSURE_ONLY = process.argv.includes("--ensure");

const USERS = [
  // Zain is the founder of the first office (and its platform admin); keep Zain first.
  { key: "zain", name: "Zain Malik", niche: null, role: "founder", label: "founder" },
  { key: "ahmed", name: "Ahmed Khan", niche: "Dental", role: "bd", label: "BD" },
  { key: "hina", name: "Hina Raza", niche: null, role: "social", label: "social media manager" },
] as const;
const TZ = "Asia/Karachi";

async function main() {
  if (!ENSURE_ONLY) await resetDatabase();
  const db = adminClient();
  // The first office (docs/11): created here after a reset, otherwise the existing one.
  const { data: firstOffice } = await db.from("offices").select("id").order("created_at").limit(1).maybeSingle();
  const officeId = firstOffice?.id ?? (await createFirstOffice(db, "BlueBugs Agency", TZ, CORE_EMAILS.zain));
  const { data: niches } = await db.from("niches").select("id, name").eq("office_id", officeId);
  const nicheId = (name: string | null) => (name ? ((niches ?? []).find((n) => n.name === name)?.id ?? null) : null);

  const { data: list, error: listErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw new Error(`Listing accounts failed: ${listErr.message}`);
  const { data: profiles } = await db.from("profiles").select("id, full_name, role");

  for (const u of USERS) {
    const email = CORE_EMAILS[u.key];
    // Find the account by its email, or (for --ensure) by name + role if the email was changed.
    const existing =
      list.users.find((a) => a.email?.toLowerCase() === email) ??
      list.users.find((a) => profiles?.some((p) => p.id === a.id && p.full_name === u.name && p.role === u.role));
    let id: string;
    if (existing) {
      const { error } = await db.auth.admin.updateUserById(existing.id, {
        email,
        password: PASSWORD,
        email_confirm: true,
        ban_duration: "none",
        user_metadata: { full_name: u.name },
      });
      if (error) throw new Error(`Restoring ${email} failed: ${error.message}`);
      id = existing.id;
    } else {
      if (u.role !== "founder" || firstOffice) await reserveMember(db, email, officeId, u.role);
      const { data, error } = await db.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.name },
      });
      if (error || !data.user) throw new Error(`Creating ${email} failed: ${error?.message}`);
      id = data.user.id;
    }
    const { error: upErr } = await db
      .from("profiles")
      .update({ full_name: u.name, email, timezone: TZ, primary_niche_id: nicheId(u.niche), role: u.role, is_active: true, deactivated_at: null })
      .eq("id", id);
    if (upErr) throw new Error(`Setting up ${email} failed: ${upErr.message}`);
  }

  const { data: after } = await db.from("profiles").select("email, role");
  console.log(ENSURE_ONLY ? `Done. The three accounts in ${where} are back to their originals:` : `Done. ${where} is empty apart from these accounts:`);
  for (const u of USERS) {
    const email = CORE_EMAILS[u.key];
    console.log(`  ${email} / ${PASSWORD}  (${u.label}; role in database: ${after?.find((p) => p.email === email)?.role})`);
  }
  console.log(`Sign in at ${appUrl}/login`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
