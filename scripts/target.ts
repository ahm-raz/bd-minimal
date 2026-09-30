/**
 * Which database a dev script talks to.
 *
 *   (default)  local Supabase, settings from .env.local
 *   --cloud    the linked Supabase Cloud project, settings from .env.cloud.local (git-ignored)
 *
 * Resetting wipes everything (all tables and all sign-in accounts) and re-applies the migrations.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

export const CLOUD = process.argv.includes("--cloud");
const envFile = path.resolve(process.cwd(), CLOUD ? ".env.cloud.local" : ".env.local");

const env: Record<string, string> = {};
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]!] = m[2]!;
  }
}
// Cloud settings come only from the cloud file, so a stray shell variable can't redirect a reset.
const pick = (k: string) => (CLOUD ? env[k] : (process.env[k] ?? env[k])) ?? "";

export const URL_ = pick("NEXT_PUBLIC_SUPABASE_URL");
export const ANON = pick("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const KEY = pick("SUPABASE_SERVICE_ROLE_KEY");
const isLocalUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(URL_);

if (CLOUD) {
  if (!fs.existsSync(envFile)) fail(`Create ${path.basename(envFile)} with the cloud URL, keys and SUPABASE_DB_PASSWORD first.`);
  if (isLocalUrl) fail(`${path.basename(envFile)} points at a local Supabase; use the command without --cloud.`);
} else if (!isLocalUrl) {
  fail(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL (${URL_ || "not set"}) is not a local Supabase. Use --cloud for the cloud project.`);
}
if (!KEY) fail(`Set SUPABASE_SERVICE_ROLE_KEY in ${path.basename(envFile)} first.`);

export const where = CLOUD ? `the CLOUD database (${URL_})` : "the LOCAL database";
export const appUrl = CLOUD ? "your Vercel URL" : "http://localhost:3000";

/** The three permanent accounts. Local keeps the @example.com logins the tests and docs use. */
export const PASSWORD = "demo-password-123";
export const CORE_EMAILS: Record<"zain" | "ahmed" | "hina", string> = CLOUD
  ? { zain: "zainfours@gmail.com", ahmed: "ahmrazsal7@gmail.com", hina: "ahmraz125@gmail.com" }
  : { zain: "zain@example.com", ahmed: "ahmed@example.com", hina: "hina@example.com" };

export function adminClient() {
  return createClient<Database>(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Wipe every table and every account, then re-apply the migrations. */
export async function resetDatabase() {
  console.log(`Erasing ${where}…`);
  const bin = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
  if (CLOUD) {
    execSync(`"${bin}" db reset --linked --yes`, {
      stdio: ["pipe", "inherit", "inherit"],
      input: "y\n",
      env: { ...process.env, SUPABASE_DB_PASSWORD: env.SUPABASE_DB_PASSWORD ?? "" },
    });
  } else {
    execSync(`"${bin}" db reset`, { stdio: "ignore" });
  }
  await waitForServices();
  // A remote reset may leave sign-in accounts behind; remove them so the founder is created fresh.
  const db = adminClient();
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(`Listing accounts failed: ${error.message}`);
    if (!data.users.length) break;
    for (const u of data.users) {
      const { error: delErr } = await db.auth.admin.deleteUser(u.id);
      if (delErr) throw new Error(`Removing ${u.email} failed: ${delErr.message}`);
    }
  }
}

async function waitForServices() {
  const probes = [`${URL_}/rest/v1/stages?select=key`, `${URL_}/auth/v1/health`];
  for (let i = 0; i < 90; i++) {
    const ok = await Promise.all(probes.map((u) => fetch(u, { headers: { apikey: ANON || KEY } }).then((r) => r.ok).catch(() => false)));
    if (ok.every(Boolean)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${where} didn't come back after the reset.`);
}

type Admin = ReturnType<typeof adminClient>;

/**
 * Offices (docs/11 section 5): an account can only be created for an email that has a place reserved in an
 * office. Scripts reserve it first, with the service-role key.
 */
export async function reserveMember(db: Admin, email: string, officeId: string, role: "founder" | "bd" | "social") {
  const { error } = await db.from("pending_members").upsert({ email: email.toLowerCase(), office_id: officeId, role });
  if (error) throw new Error(`Reserving ${email} failed: ${error.message}`);
}

/** The first office on an empty database, like /setup: its default settings and the founder's reservation. */
export async function createFirstOffice(db: Admin, name: string, timezone: string, founderEmail: string): Promise<string> {
  const { data, error } = await db.rpc("setup_first_office", { p_name: name, p_timezone: timezone, p_founder_email: founderEmail });
  if (error || !data) throw new Error(`Creating ${name} failed: ${error?.message}`);
  return data;
}

/** The office an existing account belongs to. */
export async function officeOf(db: Admin, userId: string): Promise<string> {
  const { data, error } = await db.from("profiles").select("office_id").eq("id", userId).single();
  if (error || !data) throw new Error(`No office for ${userId}: ${error?.message}`);
  return data.office_id;
}
