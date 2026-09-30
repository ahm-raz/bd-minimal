import { test as base, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import { ANON_KEY, MAILPIT_URL, SERVICE_KEY, SUPABASE_URL } from "./env";

export const PASSWORD = "test-password-123";

export type Who = "zain" | "ahmed" | "sara" | "bilal";
/** Everyone the tests can sign in as: the sales team plus the social media manager (docs/09). */
export type Member = Who | "hina";

export const TEAM: Record<Member, { name: string; email: string; timezone: string; niche: string | null }> = {
  zain: { name: "Zain Malik", email: "zain@example.com", timezone: "Asia/Karachi", niche: null },
  ahmed: { name: "Ahmed Khan", email: "ahmed@example.com", timezone: "Asia/Karachi", niche: "Dental" },
  sara: { name: "Sara Iqbal", email: "sara@example.com", timezone: "Asia/Karachi", niche: "Law" },
  bilal: { name: "Bilal Aslam", email: "bilal@example.com", timezone: "Europe/Berlin", niche: "AI SaaS" },
  // Social media manager (docs/09). Created only by the specs that need her, so earlier team counts hold.
  hina: { name: "Hina Raza", email: "hina@example.com", timezone: "Asia/Karachi", niche: null },
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
export async function clientAs(who: Member): Promise<SupabaseClient<Database>> {
  const c = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email: TEAM[who].email, password: PASSWORD });
  if (error) throw new Error(`Sign-in as ${who} failed: ${error.message}`);
  return c;
}

export async function profileId(who: Member): Promise<string | null> {
  const { data } = await admin().from("profiles").select("id").eq("email", TEAM[who].email).maybeSingle();
  return data?.id ?? null;
}

/**
 * The team's office (docs/11): the first one, made by /setup in 01-auth-team, or here like /setup when a
 * spec runs on its own. Its founder's place is reserved by setup_first_office.
 */
export async function teamOfficeId(): Promise<string> {
  const { data } = await admin().from("offices").select("id").order("created_at").limit(1).maybeSingle();
  if (data) return data.id;
  const { data: id, error } = await admin().rpc("setup_first_office", {
    p_name: "Test Agency",
    p_timezone: "Asia/Karachi",
    p_founder_email: TEAM.zain.email,
  });
  if (error || !id) throw new Error(`setup_first_office: ${error?.message}`);
  return id;
}

/** The platform owner (docs/11 section 2): a separate account in no office. Created once; safe to repeat. */
export const OWNER = { email: "owner@example.com" };
export async function ensureOwner(): Promise<void> {
  const { data } = await admin().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (data?.users.some((u) => u.email === OWNER.email)) return;
  const { error: reserveErr } = await admin().from("pending_platform_admins").upsert({ email: OWNER.email });
  if (reserveErr) throw new Error(`reserve owner: ${reserveErr.message}`);
  const { error } = await admin().auth.admin.createUser({ email: OWNER.email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(`create owner: ${error.message}`);
}

/** Sign in as the owner: they land on the Offices dashboard, not My Day. */
export async function signInOwner(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin/);
}

/** Reserve a place in an office before creating an account for this email (docs/11 section 5). */
export async function reserveMember(email: string, role: "bd" | "social" | "founder" = "bd", officeId?: string) {
  const office = officeId ?? (await teamOfficeId());
  const { error } = await admin().from("pending_members").upsert({ email: email.toLowerCase(), office_id: office, role });
  if (error) throw new Error(`reserve ${email}: ${error.message}`);
}

async function nicheId(name: string): Promise<string | null> {
  const { data } = await admin().from("niches").select("id").eq("name", name).eq("office_id", await teamOfficeId()).maybeSingle();
  return data?.id ?? null;
}

/** Create one member through the admin API, in the team's office with the right role. */
export async function ensureUser(who: Member): Promise<string> {
  const existing = await profileId(who);
  if (existing) return existing;
  const t = TEAM[who];
  const office = await teamOfficeId();
  if (who !== "zain") await reserveMember(t.email, who === "hina" ? "social" : "bd", office);
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
    .update({
      timezone: t.timezone,
      primary_niche_id: t.niche ? await nicheId(t.niche) : null,
    })
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

export async function signIn(page: Page, who: Member | { email: string; password: string }) {
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
