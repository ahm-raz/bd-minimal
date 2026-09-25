/**
 * A clean local database with three accounts and nothing else. Local only.
 *
 *   pnpm dev:test-users
 *
 * Wipes the LOCAL database (`supabase db reset`), then creates:
 *   zain@example.com   founder                 Asia/Karachi
 *   ahmed@example.com  BD (primary niche Dental) Asia/Karachi
 *   hina@example.com   social media manager    Asia/Karachi
 * All with the password demo-password-123. No leads, posts, tasks, targets or social accounts:
 * add those yourself. The default settings lists from the migration (niches, channels, sources,
 * lost reasons, activity types, outcomes, stages, content pillars) stay, because the forms need them.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

const env: Record<string, string> = { ...process.env } as Record<string, string>;
const envFile = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !env[m[1]!]) env[m[1]!] = m[2]!;
  }
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
// Checked BEFORE anything is erased: this script never touches a remote project.
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(URL_)) {
  console.error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL (${URL_ || "not set"}) is not a local Supabase.`);
  process.exit(1);
}
if (!KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

const PASSWORD = "demo-password-123";
const USERS = [
  // The first user created becomes the founder (trigger); keep Zain first.
  { key: "zain", name: "Zain Malik", email: "zain@example.com", tz: "Asia/Karachi", niche: null, role: null, label: "founder" },
  { key: "ahmed", name: "Ahmed Khan", email: "ahmed@example.com", tz: "Asia/Karachi", niche: "Dental", role: null, label: "BD" },
  { key: "hina", name: "Hina Raza", email: "hina@example.com", tz: "Asia/Karachi", niche: null, role: "social", label: "social media manager" },
] as const;

async function waitForServices() {
  const probes = [`${URL_}/rest/v1/stages?select=key`, `${URL_}/auth/v1/health`];
  for (let i = 0; i < 60; i++) {
    const ok = await Promise.all(probes.map((u) => fetch(u, { headers: { apikey: ANON || KEY } }).then((r) => r.ok).catch(() => false)));
    if (ok.every(Boolean)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Local Supabase didn't come back after the reset. Is Docker running? Try pnpm db:start.");
}

async function main() {
  console.log("Erasing the local database (supabase db reset)…");
  const bin = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
  execSync(`"${bin}" db reset`, { stdio: "ignore" });
  await waitForServices();

  const db = createClient<Database>(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: niches } = await db.from("niches").select("id, name");
  const nicheId = (name: string | null) => (name ? (niches ?? []).find((n) => n.name === name)?.id ?? null : null);

  for (const u of USERS) {
    const { data, error } = await db.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.name },
    });
    if (error || !data.user) throw new Error(`Creating ${u.email} failed: ${error?.message}`);
    const { error: upErr } = await db
      .from("profiles")
      .update({ timezone: u.tz, primary_niche_id: nicheId(u.niche), ...(u.role ? { role: u.role } : {}) })
      .eq("id", data.user.id);
    if (upErr) throw new Error(`Setting up ${u.email} failed: ${upErr.message}`);
  }

  const { data: profiles } = await db.from("profiles").select("email, role").order("role");
  console.log("Done. The database is empty apart from these accounts:");
  for (const u of USERS) {
    const role = profiles?.find((p) => p.email === u.email)?.role;
    console.log(`  ${u.email} / ${PASSWORD}  (${u.label}; role in database: ${role})`);
  }
  console.log("Sign in at http://localhost:3000/login");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
