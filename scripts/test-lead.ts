/**
 * The clean three-account database plus one fresh lead, as a BD would have just added it. Local only.
 *
 *   pnpm dev:reset-lead
 *
 * Runs `pnpm dev:reset` (wipes the LOCAL database, creates zain / ahmed / hina), then signs in as Ahmed
 * and adds "Smile Dental Austin" through the same schema and RLS path as the New lead form:
 * status New, completeness 100%, next action "Send connection request" due tomorrow (Ahmed's time zone).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { addDays, todayIn } from "../src/lib/dates";
import { emptyContact, makeLeadSchema } from "../src/lib/validation/lead";

const env: Record<string, string> = { ...process.env } as Record<string, string>;
const envFile = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !env[m[1]!]) env[m[1]!] = m[2]!;
  }
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(URL_)) {
  console.error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL (${URL_ || "not set"}) is not a local Supabase.`);
  process.exit(1);
}

async function main() {
  execSync("pnpm dev:reset", { stdio: "inherit" });

  const db = createClient<Database>(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: authErr } = await db.auth.signInWithPassword({ email: "ahmed@example.com", password: "demo-password-123" });
  if (authErr) throw new Error(`Signing in as Ahmed failed: ${authErr.message}`);
  const { data: me } = await db.auth.getUser();
  const { data: profile } = await db.from("profiles").select("id, timezone").eq("id", me.user!.id).single();

  const byName = async (table: "niches" | "channels" | "lead_sources", name: string) => {
    const { data } = await db.from(table).select("id").eq("name", name).single();
    if (!data) throw new Error(`${table} "${name}" not found`);
    return data.id;
  };
  const [dental, linkedin, upwork, googleMaps] = await Promise.all([
    byName("niches", "Dental"),
    byName("channels", "LinkedIn"),
    byName("channels", "Upwork"),
    byName("lead_sources", "Google Maps"),
  ]);

  const parsed = makeLeadSchema({ upworkChannelId: upwork }).safeParse({
    company_name: "Smile Dental Austin",
    website: "SmileDentalAustin.com",
    company_linkedin_url: "linkedin.com/company/smile-dental-austin",
    company_phone: "(512) 555-0142",
    company_email: "info@smiledentalaustin.com",
    company_size: "1-10",
    sub_niche: "Family dentistry",
    address: "2401 S Lamar Blvd",
    city: "Austin",
    state_region: "TX",
    country: "United States",
    lead_timezone: "America/Chicago",
    google_maps_url: "maps.app.goo.gl/abc123",
    google_rating: "4.73",
    google_review_count: "212",
    upwork_job_url: "",
    niche_id: dental,
    channel_id: linkedin,
    source_id: googleMaps,
    campaign_id: null,
    priority: "high",
    tags: ["austin", "family practice", "Austin"],
    pain_point: "Front desk misses calls after 5pm; new patients go to competitors.",
    offer: "AI receptionist that answers after-hours calls and books appointments.",
    notes: "Found via Google Maps. 3 dentists on staff. Website has no online booking.",
    next_action: "Send connection request",
    next_action_due: addDays(todayIn(profile!.timezone), 1),
    contacts: [
      {
        ...emptyContact(true),
        first_name: "Sarah",
        last_name: "Mitchell",
        job_title: "Practice owner",
        is_decision_maker: true,
        email: "Sarah@SmileDentalAustin.com",
        phone: "512-555-0199",
        mobile_phone: "+1 737 555 0123",
        linkedin_url: "linkedin.com/in/sarah-mitchell-dds",
        preferred_channel_id: linkedin,
        other_social_url: "instagram.com/smiledentalatx",
        secondary_email: "office@smiledentalaustin.com",
      },
    ],
  });
  if (!parsed.success) throw new Error(`Lead data is invalid: ${JSON.stringify(parsed.error.issues)}`);
  const { contacts, id: _id, owner_id: _owner, ...lead } = parsed.data;
  void _id;
  void _owner;

  const { data: row, error } = await db
    .from("leads")
    .insert({ ...lead, owner_id: profile!.id, created_by: profile!.id })
    .select("id")
    .single();
  if (error) throw new Error(`Adding the lead failed: ${error.message}`);
  const { error: cErr } = await db.from("contacts").insert(contacts.map(({ id: _cid, ...c }) => ({ ...c, lead_id: row.id })));
  if (cErr) throw new Error(`Adding Sarah failed: ${cErr.message}`);

  const { data: saved } = await db.from("leads").select("status, completeness, next_action, next_action_due").eq("id", row.id).single();
  console.log(
    `Added Smile Dental Austin as Ahmed: status ${saved!.status}, completeness ${saved!.completeness}%, ` +
      `next action "${saved!.next_action}" due ${saved!.next_action_due}.`,
  );
  console.log(`Open it: http://localhost:3000/leads/${row.id}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
