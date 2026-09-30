/**
 * Create a platform owner (docs/11 section 2): a separate account in no office that manages offices on /admin.
 *
 *   pnpm owner:add owner@example.com            local database
 *   pnpm owner:add owner@example.com --cloud    the cloud project (.env.cloud.local)
 *   add --reset to give an existing owner a new password
 *
 * Prints a generated password once. The owner can change it with "Forgot password?" on /login.
 */
import { randomBytes } from "node:crypto";
import { adminClient, appUrl, fail, where } from "./target";

const email = process.argv.slice(2).find((a) => !a.startsWith("--"))?.trim().toLowerCase();
const RESET = process.argv.includes("--reset");
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Usage: pnpm owner:add <email> [--cloud] [--reset]");

/** 20 characters, letters and digits, easy to copy. */
const newPassword = () => randomBytes(15).toString("base64").replace(/[+/=]/g, "x");

async function findUser(db: ReturnType<typeof adminClient>, address: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Listing accounts failed: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === address);
    if (hit || data.users.length < 200) return hit ?? null;
  }
}

async function main() {
  const db = adminClient();
  const existing = await findUser(db, email!);
  if (existing) {
    const { data: member } = await db.from("profiles").select("id").eq("id", existing.id).maybeSingle();
    if (member) fail(`${email} is a member of an office, so it can't be the owner. Use a different email.`);
    const { data: owner } = await db.from("platform_admins").select("user_id").eq("user_id", existing.id).maybeSingle();
    if (!owner) fail(`${email} has an account that isn't an owner. Remove it in Supabase → Authentication first.`);
    if (!RESET) {
      console.log(`${email} is already a platform owner in ${where}. Add --reset for a new password.`);
      return;
    }
    const password = newPassword();
    const { error } = await db.auth.admin.updateUserById(existing.id, { password, ban_duration: "none" });
    if (error) throw new Error(`Resetting the password failed: ${error.message}`);
    console.log(`New password for ${email}: ${password}`);
    console.log(`Sign in at ${appUrl}/login`);
    return;
  }

  const { error: reserveErr } = await db.from("pending_platform_admins").upsert({ email: email! });
  if (reserveErr) throw new Error(`Reserving ${email} failed: ${reserveErr.message}`);
  const password = newPassword();
  const { error } = await db.auth.admin.createUser({ email: email!, password, email_confirm: true, user_metadata: { full_name: "Owner" } });
  if (error) {
    await db.from("pending_platform_admins").delete().eq("email", email!);
    throw new Error(`Creating ${email} failed: ${error.message}`);
  }
  console.log(`Platform owner created in ${where}:`);
  console.log(`  ${email} / ${password}`);
  console.log(`Sign in at ${appUrl}/login. You land on Offices. Change the password with "Forgot password?" if you like.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
