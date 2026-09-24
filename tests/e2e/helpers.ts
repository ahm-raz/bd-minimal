import { test as base, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import { ANON_KEY, MAILPIT_URL, SERVICE_KEY, SUPABASE_URL } from "./env";

export const PASSWORD = "test-password-123";

export type Who = "zain" | "ahmed" | "sara" | "bilal";

export const TEAM: Record<Who, { name: string; email: string; timezone: string; niche: string | null }> = {
  zain: { name: "Zain Malik", email: "zain@example.com", timezone: "Asia/Karachi", niche: null },
  ahmed: { name: "Ahmed Khan", email: "ahmed@example.com", timezone: "Asia/Karachi", niche: "Dental" },
  sara: { name: "Sara Iqbal", email: "sara@example.com", timezone: "Asia/Karachi", niche: "Law" },
  bilal: { name: "Bilal Aslam", email: "bilal@example.com", timezone: "Europe/Berlin", niche: "AI SaaS" },
};

let adminClient: SupabaseClient<Database> | undefined;

/** Test-only service-role client for arranging data. The app itself never does this. */
export function admin(): SupabaseClient<Database> {
  adminClient ??= createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

/** A supabase-js client signed in as a team member: requests go through RLS like the app's. */
export async function clientAs(who: Who): Promise<SupabaseClient<Database>> {
  const c = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email: TEAM[who].email, password: PASSWORD });
  if (error) throw new Error(`Sign-in as ${who} failed: ${error.message}`);
  return c;
}

export async function profileId(who: Who): Promise<string | null> {
  const { data } = await admin().from("profiles").select("id").eq("email", TEAM[who].email).maybeSingle();
  return data?.id ?? null;
}

async function nicheId(name: string): Promise<string | null> {
  const { data } = await admin().from("niches").select("id").eq("name", name).maybeSingle();
  return data?.id ?? null;
}

/** Create one member through the admin API (first ever user becomes founder by trigger). */
export async function ensureUser(who: Who): Promise<string> {
  const existing = await profileId(who);
  if (existing) return existing;
  const t = TEAM[who];
  const { data, error } = await admin().auth.admin.createUser({
    email: t.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: t.name },
  });
  if (error || !data.user) throw new Error(`createUser ${who}: ${error?.message}`);
  const id = data.user.id;
  const { error: upErr } = await admin()
    .from("profiles")
    .update({ timezone: t.timezone, primary_niche_id: t.niche ? await nicheId(t.niche) : null })
    .eq("id", id);
  if (upErr) throw new Error(upErr.message);
  return id;
}

/** Founder first, then the BDs. Returns ids. Safe to call repeatedly. */
export async function ensureTeam(): Promise<Record<Who, string>> {
  const zain = await ensureUser("zain");
  const ahmed = await ensureUser("ahmed");
  const sara = await ensureUser("sara");
  const bilal = await ensureUser("bilal");
  return { zain, ahmed, sara, bilal };
}

export async function signIn(page: Page, who: Who | { email: string; password: string }) {
  const creds = typeof who === "string" ? { email: TEAM[who].email, password: PASSWORD } : who;
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/my-day/);
}

export async function signOut(page: Page) {
  await page.context().clearCookies();
}

// ---------- Local inbox (Mailpit) ------------------------------------------

type MailSummary = { ID: string; Subject: string; To: { Address: string }[]; Created: string };

export async function clearInbox() {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
}

/** Waits for the newest email to `to` and returns the first link in it matching `pattern`. */
export async function latestEmailLink(to: string, pattern: RegExp = /href="([^"]+)"/): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    if (res.ok) {
      const body = (await res.json()) as { messages: MailSummary[] };
      const msg = body.messages?.[0];
      if (msg) {
        const full = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`)).json()) as { HTML: string; Text: string };
        const m = pattern.exec(full.HTML) ?? pattern.exec(full.Text);
        if (m?.[1]) return m[1].replace(/&amp;/g, "&");
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email with a link arrived for ${to}`);
}

// ---------- Console errors fail the test ---------------------------------

const IGNORED_CONSOLE = [
  /Download the React DevTools/,
  /\[Fast Refresh\]/,
  /\[HMR\]/,
];

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() !== "error" && msg.type() !== "warning") return;
        const text = msg.text();
        if (IGNORED_CONSOLE.some((r) => r.test(text))) return;
        // Failed network requests (e.g. an expected 404 page) are asserted by tests, not here.
        if (/Failed to load resource/.test(text)) return;
        errors.push(`[${msg.type()}] ${text}`);
      });
      page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
      await use(errors);
      expect(errors, "browser console errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
