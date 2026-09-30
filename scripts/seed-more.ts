/**
 * More sample data, added alongside what's there (never deletes, never resets).
 *
 *   pnpm seed:more            the LOCAL database
 *   pnpm cloud:seed-more      the CLOUD (production) database, settings from .env.cloud.local
 *
 * Keeps every existing account and record. Uses the existing founder; reuses team members by email and
 * creates only the missing demo members (password demo-password-123, @example.com addresses that can't
 * receive mail). Then adds, per BD, about 150 leads over the last 60 days with contacts, outreach
 * history, next actions, deals in every stage, meetings and tasks, plus older social posts.
 * Safe to run again: it adds another round with fresh company names.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { TZDate } from "@date-fns/tz";
import type { Database } from "../src/lib/database.types";
import { CLOUD, CORE_EMAILS, PASSWORD, adminClient, appUrl, reserveMember, where } from "./target";

type Tables = Database["public"]["Tables"];
const db: SupabaseClient<Database> = adminClient();
const DAY = 86_400_000;
const HOUR = 3_600_000;
const LEADS_PER_BD = Number(process.env.SEED_LEADS_PER_BD ?? 150);
const SPAN_DAYS = Number(process.env.SEED_SPAN_DAYS ?? 60);
const RUN_START = new Date();

// A fresh random sequence each run, so a second run adds different companies.
let seed = Date.now() % 2147483647;
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const chance = (p: number) => rand() < p;
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error || res.data === null || res.data === undefined) throw new Error(`${what}: ${res.error?.message ?? "no data"}`);
  return res.data as NonNullable<T>;
}
const chunks = <T>(xs: T[], n = 400): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const localDate = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);

/** A working-hours instant (09:00–18:00 in `tz`) `daysAgo` days back, never in the future. */
function workTime(daysAgo: number, tz: string): Date {
  const day = localDate(new Date(Date.now() - daysAgo * DAY), tz);
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const t = new Date(new TZDate(y, m - 1, d, 9, 0, 0, tz).getTime() + Math.floor(rand() * 9 * HOUR));
  return t > new Date() ? new Date(Date.now() - Math.floor(rand() * HOUR) - 60_000) : t;
}

// ---------- Team --------------------------------------------------------------------------
/** `niches`: preferred niche names in order; "profile" means the member's current primary niche. */
type Member = { key: string; name: string; email: string; tz: string; niches: string[]; role: "bd" | "social" };
const BDS: Member[] = [
  { key: "ahmed", name: "Ahmed Khan", email: CORE_EMAILS.ahmed, tz: "Asia/Karachi", niches: ["profile", "Dental", "Full Stack Developer"], role: "bd" },
  { key: "sara", name: "Sara Iqbal", email: "sara@example.com", tz: "Asia/Karachi", niches: ["Law"], role: "bd" },
  { key: "bilal", name: "Bilal Aslam", email: "bilal@example.com", tz: "Europe/Berlin", niches: ["AI SaaS"], role: "bd" },
  { key: "omar", name: "Omar Farooq", email: "omar@example.com", tz: "Asia/Karachi", niches: ["Dental", "Full Stack Developer"], role: "bd" },
  { key: "ayesha", name: "Ayesha Siddiqui", email: "ayesha@example.com", tz: "Asia/Dubai", niches: ["Law"], role: "bd" },
];
const SMM: Member = { key: "hina", name: "Hina Raza", email: CORE_EMAILS.hina, tz: "Asia/Karachi", niches: [], role: "social" };

// ---------- Name pools ------------------------------------------------------------------------
const PLACES = [
  ["Austin", "TX", "America/Chicago"], ["Dallas", "TX", "America/Chicago"], ["Houston", "TX", "America/Chicago"],
  ["San Antonio", "TX", "America/Chicago"], ["Phoenix", "AZ", "America/Phoenix"], ["Scottsdale", "AZ", "America/Phoenix"],
  ["Denver", "CO", "America/Denver"], ["Boulder", "CO", "America/Denver"], ["San Diego", "CA", "America/Los_Angeles"],
  ["Sacramento", "CA", "America/Los_Angeles"], ["Irvine", "CA", "America/Los_Angeles"], ["Miami", "FL", "America/New_York"],
  ["Tampa", "FL", "America/New_York"], ["Orlando", "FL", "America/New_York"], ["Atlanta", "GA", "America/New_York"],
  ["Charlotte", "NC", "America/New_York"], ["Raleigh", "NC", "America/New_York"], ["Nashville", "TN", "America/Chicago"],
  ["Chicago", "IL", "America/Chicago"], ["Columbus", "OH", "America/New_York"], ["Seattle", "WA", "America/Los_Angeles"],
  ["Portland", "OR", "America/Los_Angeles"], ["Boston", "MA", "America/New_York"], ["Minneapolis", "MN", "America/Chicago"],
  ["Salt Lake City", "UT", "America/Denver"], ["Las Vegas", "NV", "America/Los_Angeles"], ["Kansas City", "MO", "America/Chicago"],
  ["Pittsburgh", "PA", "America/New_York"], ["Richmond", "VA", "America/New_York"], ["Madison", "WI", "America/Chicago"],
] as const;

const POOLS: Record<string, { a: string[]; b: string[]; titles: string[]; pain: string[]; offers: string[] }> = {
  Dental: {
    a: ["Bright Smile", "Riverside", "Oak Hill", "Lakeview", "Sunrise", "Gentle Care", "Maple Street", "Summit", "Harbor",
      "Pinecrest", "Cedar Park", "Willow Creek", "Blue Sky", "Evergreen", "Northside", "Parkway", "Meadowbrook", "Highland",
      "Silver Lake", "Golden Gate", "Magnolia", "Bayside", "Stonebridge", "Aspen", "Heritage", "Crystal Springs", "Westfield",
      "Lighthouse", "Brookside", "Canyon View", "Juniper", "Redwood", "Twin Oaks", "Main Street", "Prairie"],
    b: ["Dental", "Dental Care", "Family Dentistry", "Smiles", "Orthodontics", "Dental Studio", "Pediatric Dentistry",
      "Dental Group", "Cosmetic Dentistry", "Dental Arts", "Dental Associates"],
    titles: ["Owner", "Practice manager", "Office manager", "Lead dentist", "Front desk lead", "Associate dentist"],
    pain: ["Missed calls after hours", "No-shows for cleanings", "Slow new-patient intake", "Old website, no online booking",
      "Front desk overloaded on Mondays", "Few Google reviews for the area", "Insurance questions tie up the phone"],
    offers: ["AI intake that books visits", "Website rebuild with online booking", "Review booster", "Recall reminders"],
  },
  Law: {
    a: ["Hartman", "Reyes", "Whitfield", "Castillo", "Brennan", "Okafor", "Lindqvist", "Morales", "Sutton", "Delgado",
      "Keller", "Ashford", "Prescott", "Vance", "Holloway", "Garrison", "Mercer", "Donovan", "Fairbanks", "Calloway",
      "Thornton", "Beckett", "Sinclair", "Montgomery", "Harlow", "Pemberton", "Quinlan", "Radcliffe", "Stanton", "Winslow"],
    b: ["& Cole", "Law Group", "Legal", "& Partners", "Injury Law", "Family Law", "Law Firm", "Immigration Law",
      "Estate Planning", "Defense Law", "Law Offices"],
    titles: ["Managing partner", "Partner", "Office administrator", "Intake manager", "Paralegal", "Senior associate"],
    pain: ["Intake calls go to voicemail", "Slow case qualification", "Manual document collection", "No follow-up on web leads",
      "Consults booked by email back-and-forth", "After-hours injury calls lost"],
    offers: ["24/7 intake assistant", "Consult booking flow", "Document collection portal", "Web lead follow-up"],
  },
  "AI SaaS": {
    a: ["Nimbus", "Vectorly", "Quanta", "Lumen", "Cortex", "Synapse", "Prism", "Arcadia", "Helix", "Nova", "Orbital",
      "Stratus", "Kinetic", "Parallel", "Beacon", "Fathom", "Tensorly", "Axion", "Veritas", "Nexa", "Polaris", "Luminary",
      "Cobalt", "Zenith", "Aether", "Mosaic", "Vertex", "Ember", "Quill", "Radiant"],
    b: ["AI", "Labs", "Analytics", "Cloud", "Systems", "Data", "HQ", "Robotics", "Health AI", "Insights"],
    titles: ["CTO", "Founder", "Head of Engineering", "VP Product", "Engineering manager", "Head of Data"],
    pain: ["Needs an ML engineer for a pilot", "Backlog of integrations", "Slow model deployment", "No in-house data team",
      "RAG prototype stuck in demo", "Costs of LLM calls climbing"],
    offers: ["ML engineer, 3 months", "Integration sprint", "RAG to production", "Evaluation harness"],
  },
};
POOLS["Full Stack Developer"] = {
  a: ["Brightpath", "Loop", "Northstar", "Kite", "Pillar", "Harborline", "Fieldstone", "Trailhead", "Copperleaf", "Bluebird",
    "Wavelength", "Foundry", "Keel", "Anchorpoint", "Sparrow", "Greenlight", "Clearwater", "Rivet", "Lattice", "Signal",
    "Meridian", "Tandem", "Upland", "Openfield", "Driftwood", "Skylark", "Hearth", "Waypoint", "Ironwood", "Sundial"],
  b: ["Software", "Apps", "Digital", "Commerce", "Health", "Logistics", "Fintech", "Studio", "Platforms", "Learning"],
  titles: ["Founder", "CTO", "Product manager", "Head of Product", "Operations lead", "COO"],
  pain: ["MVP behind schedule", "Legacy PHP app needs a rebuild", "No in-house developers", "Slow, buggy customer portal",
    "Needs a mobile-friendly dashboard", "Stripe billing half built"],
  offers: ["Full stack MVP build", "Next.js rebuild", "Customer portal", "Dashboard and API sprint"],
};
const poolFor = (niche: string) => POOLS[niche] ?? POOLS["Full Stack Developer"]!;
/** Tech niches: bigger deals, no Google ratings, larger companies. */
const isTech = (niche: string) => niche !== "Dental" && niche !== "Law";

const FIRST = ["Maria", "James", "Priya", "David", "Laura", "Kevin", "Aisha", "Daniel", "Emily", "Carlos", "Nora", "Ethan",
  "Sofia", "Ryan", "Grace", "Omar", "Hannah", "Lucas", "Chloe", "Marcus", "Olivia", "Noah", "Isabella", "Liam", "Mia",
  "Benjamin", "Zara", "Henry", "Leila", "Samuel", "Ava", "Jacob", "Fatima", "Owen", "Elena", "Tyler", "Nadia", "Adrian"];
const LAST = ["Lopez", "Patel", "Nguyen", "Smith", "Garcia", "Johnson", "Kim", "Brown", "Rossi", "Chen", "Walker",
  "Mitchell", "Reed", "Foster", "Ward", "Bennett", "Carter", "Hughes", "Price", "Coleman", "Ortiz", "Sanders", "Murphy",
  "Rivera", "Brooks", "Hayes", "Fisher", "Hamilton", "Graham", "Wallace", "Ramirez", "Shah"];

/** The office this script adds to: the first one (created by /setup or seed:demo), docs/11. */
let OFFICE_ID = "";

async function listIds(table: "niches" | "channels" | "lead_sources" | "lost_reasons" | "activity_types") {
  const rows = must(await db.from(table).select("id, name").eq("office_id", OFFICE_ID), table);
  return Object.fromEntries(rows.map((r) => [r.name, r.id])) as Record<string, string>;
}

async function ensureMember(m: Member, nicheId: string | null, existing: Map<string, string>): Promise<string> {
  const found = existing.get(m.email.toLowerCase());
  if (found) return found;
  await reserveMember(db, m.email, OFFICE_ID, m.role);
  const created = await db.auth.admin.createUser({
    email: m.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: m.name },
  });
  if (created.error || !created.data.user) throw new Error(`user ${m.email}: ${created.error?.message}`);
  const id = created.data.user.id;
  must(
    await db
      .from("profiles")
      .update({ timezone: m.tz, primary_niche_id: nicheId })
      .eq("id", id)
      .select("id"),
    `profile ${m.email}`,
  );
  console.log(`  created ${m.name} <${m.email}>`);
  return id;
}

async function main() {
  console.log(`Adding sample data to ${where}. Nothing is deleted.`);
  const office = must(await db.from("offices").select("id, name").order("created_at").limit(1).maybeSingle(), "office");
  OFFICE_ID = office.id;
  console.log(`  office: ${office.name}`);
  const founder = must(
    await db.from("profiles").select("id, full_name").eq("role", "founder").eq("office_id", OFFICE_ID).maybeSingle(),
    "founder",
  );
  const niches = await listIds("niches");
  const channels = await listIds("channels");
  const sources = await listIds("lead_sources");
  const lostReasons = await listIds("lost_reasons");
  const types = await listIds("activity_types");

  // Every account (emails are unique app-wide), so a member of another office is never created twice.
  const profiles = must(await db.from("profiles").select("id, email, primary_niche_id, office_id"), "profiles");
  const byEmail = new Map(profiles.map((p) => [p.email.toLowerCase(), p.id]));
  // Each BD's niche, from the niches that exist here (lists differ between databases).
  const activeNiches = must(
    await db.from("niches").select("id, name").eq("is_active", true).eq("office_id", OFFICE_ID),
    "active niches",
  );
  const nicheName = new Map(activeNiches.map((n) => [n.id, n.name]));
  const resolved: Record<string, string> = {};
  for (const m of BDS) {
    const current = profiles.find((p) => p.email.toLowerCase() === m.email.toLowerCase())?.primary_niche_id;
    const choice = m.niches
      .map((n) => (n === "profile" ? (current ? nicheName.get(current) : undefined) : activeNiches.find((x) => x.name === n)?.name))
      .find(Boolean);
    resolved[m.key] = choice ?? activeNiches.find((n) => n.name !== "Agency Partnerships")?.name ?? activeNiches[0]!.name;
  }
  console.log("  niches: " + BDS.map((b) => b.name + " = " + resolved[b.key]).join(", "));
  const ids: Record<string, string> = { founder: founder.id };
  for (const m of [...BDS, SMM]) ids[m.key] = await ensureMember(m, m.role === "bd" ? niches[resolved[m.key]!]! : null, byEmail);
  // Demo members created earlier without a niche get theirs now.
  for (const m of BDS.filter((b) => b.email.endsWith("@example.com"))) {
    await db.from("profiles").update({ primary_niche_id: niches[resolved[m.key]!] }).eq("id", ids[m.key]!).is("primary_niche_id", null);
  }

  // Targets for members without any (never overwrite the founder's settings).
  const { data: haveTargets } = await db.from("targets").select("user_id").eq("office_id", OFFICE_ID);
  const withTargets = new Set((haveTargets ?? []).map((t) => t.user_id));
  const targets: Tables["targets"]["Insert"][] = [];
  for (const m of BDS) {
    if (withTargets.has(ids[m.key]!)) continue;
    targets.push(
      { user_id: ids[m.key]!, metric: "leads_added", weekly_value: 112 },
      { user_id: ids[m.key]!, metric: "outreach", weekly_value: 75 },
      { user_id: ids[m.key]!, metric: "follow_ups", weekly_value: 100 },
      { user_id: ids[m.key]!, metric: "meetings_booked", weekly_value: 3 },
    );
  }
  if (!withTargets.has(ids.hina!)) targets.push({ user_id: ids.hina!, metric: "posts_published", weekly_value: 5 });
  if (targets.length) must(await db.from("targets").insert(targets).select("id"), "targets");

  // Campaigns: add these if missing, then use every campaign per niche.
  const wanted: Tables["campaigns"]["Insert"][] = [...new Set(Object.values(resolved))].flatMap((n) => {
    const owner = ids[BDS.find((b) => resolved[b.key] === n)!.key]!;
    return [
      { name: n + ": LinkedIn outreach", niche_id: niches[n]!, channel_id: channels.LinkedIn ?? null, owner_id: owner },
      { name: n + ": Email sequence", niche_id: niches[n]!, channel_id: channels.Email ?? null, owner_id: owner },
    ];
  });
  await db
    .from("campaigns")
    .upsert(
      wanted.map((c) => ({ ...c, office_id: OFFICE_ID })),
      { onConflict: "office_id,name", ignoreDuplicates: true },
    );
  const campaigns = must(await db.from("campaigns").select("id, name, niche_id").eq("office_id", OFFICE_ID), "campaigns");

  const existingNames = new Set(
    must(await db.from("leads").select("company_name").eq("office_id", OFFICE_ID).limit(20000), "names").map((l) =>
      l.company_name.toLowerCase(),
    ),
  );

  type Planned = {
    id: string;
    owner: string;
    tz: string;
    niche: string;
    channel: string;
    company: string;
    createdAt: Date;
    contactId: string | null;
    contactName: string;
    replied: string | null;
  };
  const planned: Planned[] = [];
  let leadCount = 0;
  let contactCount = 0;
  let activityCount = 0;

  for (const bd of BDS) {
    const owner = ids[bd.key]!;
    const niche = resolved[bd.key]!;
    const pool = poolFor(niche);
    const nicheCampaigns = campaigns.filter((c) => c.niche_id === niches[niche]);
    const leadRows: Tables["leads"]["Insert"][] = [];
    const meta: Omit<Planned, "id" | "contactId" | "contactName" | "replied">[] = [];
    for (let i = 0; i < LEADS_PER_BD; i++) {
      // More recent days are busier; weekends quieter.
      let daysAgo = Math.floor(Math.pow(rand(), 1.3) * SPAN_DAYS);
      const dow = new Date(Date.now() - daysAgo * DAY).getUTCDay();
      if ((dow === 0 || dow === 6) && chance(0.75)) daysAgo = Math.max(0, daysAgo - 2);
      const [city, state, leadTz] = pick(PLACES);
      let company = `${pick(pool.a)} ${pick(pool.b)}`;
      for (let tries = 0; existingNames.has(company.toLowerCase()) && tries < 30; tries++) {
        company = tries < 10 ? `${pick(pool.a)} ${pick(pool.b)}` : `${pick(pool.a)} ${pick(pool.b)} of ${city}`;
      }
      if (existingNames.has(company.toLowerCase())) company = `${company} ${int(2, 99)}`;
      existingNames.add(company.toLowerCase());
      const detailed = chance(0.7);
      const channel = isTech(niche) ? (chance(0.8) ? "LinkedIn" : "Email") : chance(0.35) ? "Email" : "LinkedIn";
      const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40);
      const createdAt = workTime(daysAgo, bd.tz);
      const due = localDate(new Date(Date.now() + pick([-5, -3, -2, -1, -1, 0, 0, 0, 1, 1, 2, 3, 5, 7, 10]) * DAY), bd.tz);
      const hasNext = chance(0.82);
      leadRows.push({
        owner_id: owner,
        created_by: owner,
        company_name: company,
        website: detailed || chance(0.4) ? `https://${slug}.com` : null,
        company_linkedin_url: detailed && chance(0.7) ? `https://www.linkedin.com/company/${slug}` : null,
        company_phone: chance(0.55) ? `+1${int(201, 989)}555${String(int(1000, 9999))}` : null,
        company_email: detailed && chance(0.3) ? `hello@${slug}.com` : null,
        city: detailed || chance(0.5) ? city : null,
        state_region: detailed || chance(0.5) ? state : null,
        country: "United States",
        lead_timezone: leadTz,
        company_size: isTech(niche) ? pick(["11-50", "51-200", "201-500"]) : pick(["1-10", "11-50", "11-50"]),
        google_rating: isTech(niche) ? null : Math.round((3.6 + rand() * 1.4) * 10) / 10,
        google_review_count: isTech(niche) ? null : int(12, 420),
        niche_id: niches[niche]!,
        channel_id: channels[channel]!,
        source_id: detailed
          ? sources[pick(["Manual research", "LinkedIn Sales Navigator", "Apollo", "Google Maps", "Referral"])] ?? null
          : null,
        campaign_id: nicheCampaigns.length && chance(0.7) ? pick(nicheCampaigns).id : null,
        priority: pick(["high", "medium", "medium", "medium", "low"] as const),
        pain_point: detailed && chance(0.8) ? pick(pool.pain) : null,
        offer: detailed && chance(0.5) ? pick(pool.offers) : null,
        notes: chance(0.15) ? "Met at a local business meetup; prefers email." : null,
        tags: chance(0.35) ? [state.toLowerCase()] : [],
        next_action: hasNext ? pick(["Send follow-up", "Book a call", "Send case study", "Call the office"]) : null,
        next_action_due: hasNext ? due : null,
        created_at: createdAt.toISOString(),
      });
      meta.push({ owner, tz: bd.tz, niche, channel, company, createdAt });
    }
    const leadIds: string[] = [];
    for (const part of chunks(leadRows, 200)) {
      leadIds.push(...must(await db.from("leads").insert(part).select("id"), "leads").map((l) => l.id));
    }
    leadCount += leadIds.length;

    // Contacts: 1–3 per lead; a few leads have none yet.
    const contactRows: Tables["contacts"]["Insert"][] = [];
    const firstContact = new Map<string, number>();
    leadIds.forEach((leadId, i) => {
      const m = meta[i]!;
      const n = chance(0.06) ? 0 : 1 + (chance(0.45) ? 1 : 0) + (chance(0.15) ? 1 : 0);
      const slug = m.company.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40);
      for (let c = 0; c < n; c++) {
        const first = pick(FIRST);
        const last = pick(LAST);
        if (c === 0) firstContact.set(leadId, contactRows.length);
        contactRows.push({
          lead_id: leadId,
          first_name: c === 0 && niche === "Dental" && chance(0.6) ? `Dr. ${first}` : first,
          last_name: last,
          job_title: pool.titles[c % pool.titles.length]!,
          is_primary: c === 0,
          is_decision_maker: c === 0 && chance(0.6),
          email: chance(0.75) ? `${first.toLowerCase()}.${last.toLowerCase()}@${slug}.com` : null,
          email_status: chance(0.6) ? "valid" : "unverified",
          phone: chance(0.45) ? `+1${int(201, 989)}556${String(int(1000, 9999))}` : null,
          mobile_phone: null,
          linkedin_url: chance(0.7) ? `https://www.linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}-${int(100, 99999)}` : null,
        });
      }
    });
    const contactIds: string[] = [];
    for (const part of chunks(contactRows, 300)) {
      contactIds.push(...must(await db.from("contacts").insert(part).select("id"), "contacts").map((c) => c.id));
    }
    contactCount += contactIds.length;

    // Outreach history: outreach → follow-ups → sometimes a reply. Inserted in time order.
    const actRows: (Tables["activities"]["Insert"] & { _t: number })[] = [];
    leadIds.forEach((leadId, i) => {
      const m = meta[i]!;
      const ci = firstContact.get(leadId);
      const contactId = ci === undefined ? null : contactIds[ci]!;
      const contact = ci === undefined ? null : contactRows[ci]!;
      const age = Math.max(0, Math.floor((Date.now() - m.createdAt.getTime()) / DAY));
      const outreach = m.channel === "Email" ? "Cold email" : pick(["LinkedIn connection request", "LinkedIn message"]);
      const follow = m.channel === "Email" ? "Email follow-up" : "LinkedIn follow-up";
      const steps: { type: string; outcome: string; after: number }[] = [];
      if (contactId && chance(0.93)) steps.push({ type: outreach, outcome: chance(0.05) ? "bounced" : "no_response", after: 0 });
      let t = 0;
      for (let f = 0; f < 3 && steps.length && age > t + 1 && chance(f === 0 ? 0.85 : 0.55); f++) {
        t = Math.min(age, t + int(2, 5));
        steps.push({ type: follow, outcome: "no_response", after: t });
      }
      let replied: string | null = null;
      if (steps.length >= 2 && age > t + 1 && chance(0.38)) {
        replied = pick(["interested", "interested", "interested", "not_now", "not_interested", "meeting_booked", "meeting_booked"]);
        t = Math.min(age, t + int(1, 4));
        steps.push({ type: "Reply received", outcome: replied, after: t });
        if ((replied === "interested" || replied === "meeting_booked") && age > t + 2 && chance(0.4)) {
          steps.push({ type: "Phone call", outcome: "interested", after: Math.min(age, t + int(1, 3)) });
        }
      }
      for (const s of steps) {
        const at = Math.min(Date.now() - 60_000, m.createdAt.getTime() + s.after * DAY + Math.floor(rand() * 4 * HOUR));
        actRows.push({
          lead_id: leadId,
          user_id: m.owner,
          contact_id: contactId,
          activity_type_id: types[s.type]!,
          category: "other",
          outcome_key: s.outcome,
          occurred_at: new Date(at).toISOString(),
          notes: s.type === "Reply received" && chance(0.5) ? "Asked for pricing and a short demo." : null,
          _t: at,
        });
      }
      planned.push({
        ...m,
        id: leadId,
        contactId,
        contactName: contact ? `${contact.first_name} ${contact.last_name ?? ""}`.trim() : "",
        replied,
      });
    });
    actRows.sort((a, b) => a._t - b._t);
    const acts = actRows.map(({ _t: _ignored, ...row }) => row);
    for (const part of chunks(acts, 400)) must(await db.from("activities").insert(part).select("id"), "activities");
    activityCount += acts.length;
    console.log(`  ${bd.name}: ${leadIds.length} leads, ${contactIds.length} contacts, ${acts.length} activities`);
  }

  // Deals: from leads that replied with interest; every stage, some stuck, some won or lost.
  const PATH: Record<string, string[]> = {
    qualified: [],
    meeting_done: ["meeting_done"],
    proposal_sent: ["meeting_done", "proposal_sent"],
    negotiation: ["meeting_done", "proposal_sent", "negotiation"],
    won: ["meeting_done", "proposal_sent", "negotiation", "won"],
    lost: ["meeting_done", "lost"],
  };
  const stagesPlan = ["qualified", "qualified", "qualified", "meeting_done", "meeting_done", "meeting_done", "proposal_sent",
    "proposal_sent", "proposal_sent", "negotiation", "negotiation", "won", "won", "won", "lost", "lost"];
  let oppCount = 0;
  for (const bd of BDS) {
    const hot = planned
      .filter((l) => l.owner === ids[bd.key] && (l.replied === "interested" || l.replied === "meeting_booked"))
      .sort(() => rand() - 0.5);
    for (let i = 0; i < Math.min(hot.length, stagesPlan.length); i++) {
      const l = hot[i]!;
      const stage = stagesPlan[i]!;
      const pool = poolFor(l.niche);
      const value = isTech(l.niche) ? int(6, 30) * 1000 : int(12, 90) * 100;
      const daysAgo = int(1, 25);
      const opp = must(
        await db
          .from("opportunities")
          .insert({ lead_id: l.id, owner_id: l.owner, created_by: l.owner, title: pick(pool.offers), estimated_value: value })
          .select("id")
          .single(),
        "opportunity",
      );
      for (const to of PATH[stage]!) {
        const u: Tables["opportunities"]["Update"] = { stage_key: to };
        if (to === "won") {
          const monthly = chance(0.4);
          Object.assign(u, {
            won_value: value,
            contract_type: monthly ? "monthly" : "one_time",
            monthly_amount: monthly ? int(2, 8) * 100 : 0,
            won_at: new Date(Date.now() - daysAgo * DAY).toISOString(),
          });
        }
        if (to === "lost") {
          Object.assign(u, {
            lost_reason_id: lostReasons[pick(["Price", "Timing", "No response", "Went with competitor"])] ?? Object.values(lostReasons)[0],
            lost_at: new Date(Date.now() - daysAgo * DAY).toISOString(),
          });
        }
        must(await db.from("opportunities").update(u).eq("id", opp.id).select("id"), `move ${to}`);
      }
      const events = must(await db.from("opportunity_stage_events").select("id").eq("opportunity_id", opp.id).order("id"), "events");
      const start = daysAgo + events.length * int(2, 5);
      for (let e = 0; e < events.length; e++) {
        const at = new Date(Date.now() - Math.max(daysAgo, start - e * 3) * DAY);
        await db.from("opportunity_stage_events").update({ changed_at: at.toISOString(), changed_by: l.owner }).eq("id", events[e]!.id);
      }
      await db
        .from("opportunities")
        .update({
          stage_changed_at: new Date(Date.now() - daysAgo * DAY).toISOString(),
          created_at: new Date(Date.now() - start * DAY).toISOString(),
        })
        .eq("id", opp.id);
      oppCount++;
    }
  }

  // Meetings: per BD, coming up this week and next, a few held, one cancelled, one no-show.
  const meetingRows: Tables["meetings"]["Insert"][] = [];
  for (const bd of BDS) {
    const leads = planned.filter((l) => l.owner === ids[bd.key] && l.contactId && l.replied).slice(0, 8);
    const offsets = [4 * HOUR, 1 * DAY + 2 * HOUR, 2 * DAY, 4 * DAY, 8 * DAY, -1 * DAY, -3 * DAY, -6 * DAY];
    leads.forEach((l, i) => {
      const startsIn = offsets[i]!;
      const past = startsIn < 0;
      meetingRows.push({
        lead_id: l.id,
        owner_id: l.owner,
        created_by: l.owner,
        contact_id: l.contactId,
        title: `Meeting with ${l.contactName} (${l.company})`,
        starts_at: new Date(Math.round((Date.now() + startsIn) / (15 * 60_000)) * 15 * 60_000).toISOString(),
        duration_min: pick([30, 30, 45, 60]),
        timezone: pick(["America/Chicago", "America/New_York", "America/Los_Angeles"]),
        location: chance(0.8) ? "https://meet.google.com/abc-defg-hij" : "Phone",
        agenda: chance(0.6) ? "Walk through their intake today and show the demo." : null,
        reminder_minutes: [30, 10],
        status: past ? (i === 7 ? "no_show" : "held") : i === 4 ? "cancelled" : "scheduled",
        status_note: i === 4 ? "They asked to move it to next month" : null,
      });
    });
  }
  if (meetingRows.length) must(await db.from("meetings").insert(meetingRows).select("id"), "meetings");

  // Tasks: a few checklist tasks per BD around today, some done.
  const taskRows: Tables["tasks"]["Insert"][] = [];
  for (const bd of BDS) {
    const mine = planned.filter((l) => l.owner === ids[bd.key]);
    for (let i = 0; i < 4; i++) {
      const l = pick(mine);
      const dueOffset = [-2, -1, 0, 1][i]!;
      taskRows.push({
        assignee_id: ids[bd.key]!,
        created_by: founder.id,
        title: pick([`Research ${l.company} before the call`, "Clean up leads with no next action", "Update stuck deals",
          `Send the case study to ${l.company}`, "Ask two customers for referrals"]),
        kind: "checklist",
        lead_id: l.id,
        due_date: localDate(new Date(Date.now() + dueOffset * DAY), bd.tz),
        completed_at: dueOffset < 0 && chance(0.6) ? new Date(Date.now() + dueOffset * DAY).toISOString() : null,
      });
    }
  }
  must(await db.from("tasks").insert(taskRows).select("id"), "tasks");

  const posts = await seedOlderPosts(founder.id, ids.hina!);

  // Feed times: the triggers stamped this run's lead and activity events "now"; move them to when it happened.
  await backdateFeed(planned);

  // Seeded moves have no actor and would read as someone else's; drop those from this run only.
  await db.from("notifications").delete().is("actor_id", null).neq("kind", "post_missed").gte("created_at", RUN_START.toISOString());

  console.log(
    `Done: ${leadCount} leads, ${contactCount} contacts, ${activityCount} activities, ${oppCount} deals, ` +
      `${meetingRows.length} meetings, ${taskRows.length} tasks, ${posts} posts.`,
  );
  console.log(`Demo logins at ${appUrl}/login (password ${PASSWORD}), existing accounts unchanged:`);
  for (const m of BDS.filter((b) => b.email.endsWith("@example.com"))) console.log(`  ${m.email}  (BD)`);
  if (CLOUD) console.log("Change or deactivate the @example.com accounts before real use.");
}

async function backdateFeed(planned: { id: string; createdAt: Date }[]) {
  const when = new Map(planned.map((l) => [l.id, l.createdAt]));
  const feed = must(
    await db
      .from("feed_events")
      .select("*")
      .gte("created_at", RUN_START.toISOString())
      .in("kind", ["lead_created", "activity_logged"])
      .order("id")
      .limit(20000),
    "feed",
  );
  // activity_logged events in id order match activities inserted in time order per lead.
  const actTimes = new Map<string, string[]>();
  for (const part of chunks([...when.keys()], 150)) {
    const rows = must(
      await db.from("activities").select("lead_id, occurred_at").in("lead_id", part).order("occurred_at"),
      "activity times",
    );
    for (const r of rows) actTimes.set(r.lead_id, [...(actTimes.get(r.lead_id) ?? []), r.occurred_at]);
  }
  const seen = new Map<string, number>();
  const fixed = feed.flatMap((e) => {
    if (!e.lead_id || !when.has(e.lead_id)) return [];
    if (e.kind === "lead_created") return [{ ...e, created_at: when.get(e.lead_id)!.toISOString() }];
    const n = seen.get(e.lead_id) ?? 0;
    seen.set(e.lead_id, n + 1);
    const t = actTimes.get(e.lead_id)?.[n];
    return t ? [{ ...e, created_at: t }] : [];
  });
  // Feed ids are identity columns, so each row is updated on its own; 25 at a time keeps it quick.
  for (const part of chunks(fixed, 25)) {
    await Promise.all(part.map((e) => db.from("feed_events").update({ created_at: e.created_at }).eq("id", e.id)));
  }
}

// ---------- Older social posts ----------------------------------------------------------------
const NY = "America/New_York";
const TITLES = ["How AI intake cuts missed calls", "Case study: 30% more bookings for a dental clinic",
  "3 signs your website is costing you clients", "What a law firm learned from 1,000 intake calls",
  "Tip: answer every call in under 5 seconds", "Client result: 42 new consults in a month",
  "Why after-hours calls matter", "Our website migration checklist", "Patients now book online first",
  "The cost of a missed call, in dollars", "Lessons from our first 50 clients", "What founders get wrong about follow-ups"];
const CAPTION = "Every missed call is a lost client. Here is what changed for one clinic in 30 days, and the three fixes you can make this week.";

function at(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  return new Date(new TZDate(y, m - 1, d, h, mi, 0, tz).getTime());
}
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Posts from 45 to 15 days ago on the existing accounts (posted with results, a few missed). */
async function seedOlderPosts(founderId: string, hina: string): Promise<number> {
  const accounts = must(
    await db.from("social_accounts").select("id, name").eq("is_active", true).eq("office_id", OFFICE_ID).order("sort_order"),
    "accounts",
  );
  if (accounts.length === 0) {
    console.log("  No social accounts: skipped posts.");
    return 0;
  }
  const today = localDate(new Date(), NY);
  const from = at(addDays(today, -45), "00:00", NY).toISOString();
  const to = at(addDays(today, -15), "23:59", NY).toISOString();
  const taken = new Set(
    must(await db.from("posts").select("account_id, scheduled_at").gte("scheduled_at", from).lte("scheduled_at", to), "existing posts").map(
      (p) => `${p.account_id}|${new Date(p.scheduled_at!).getTime()}`,
    ),
  );
  let n = 0;
  for (let i = -45; i <= -15; i++) {
    const d = addDays(today, i);
    const dow = ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    for (const [ai, acc] of accounts.slice(0, 2).entries()) {
      if (ai === 0 ? ![1, 3, 5].includes(dow) : ![2, 4].includes(dow)) continue;
      const when = at(d, ai === 0 ? "09:00" : "12:00", NY);
      if (taken.has(`${acc.id}|${when.getTime()}`)) continue;
      const missed = chance(0.1);
      const post = must(
        await db
          .from("posts")
          .insert({
            account_id: acc.id,
            assignee_id: hina,
            created_by: founderId,
            title: pick(TITLES),
            format: "text",
            scheduled_at: when.toISOString(),
            timezone: NY,
            needs_approval: true,
            status: "planned",
          })
          .select("id")
          .single(),
        "post",
      );
      const flow = missed ? (["drafting", "missed"] as const) : (["drafting", "in_review", "approved", "posted"] as const);
      const postedAt = new Date(when.getTime() + int(0, 40) * 60_000);
      for (const s of flow) {
        const u: Tables["posts"]["Update"] = { status: s };
        if (s === "drafting") u.caption = CAPTION;
        if (s === "posted") {
          u.posted_at = postedAt.toISOString();
          u.post_url = `https://www.linkedin.com/feed/update/urn:li:activity:73${String(int(1e14, 9e14))}`;
        }
        must(await db.from("posts").update(u).eq("id", post.id).select("id"), `post ${s}`);
      }
      if (!missed) {
        const impressions = int(300, 3000);
        await db
          .from("posts")
          .update({
            impressions,
            reactions: Math.floor(impressions * (0.02 + rand() * 0.03)),
            comments_count: int(0, 15),
            shares: int(0, 9),
            clicks: int(0, 45),
            results_recorded_at: new Date(postedAt.getTime() + 2 * DAY).toISOString(),
          })
          .eq("id", post.id);
      }
      const begin = new Date(when.getTime() - 3 * DAY).toISOString();
      await db.from("posts").update({ created_at: begin }).eq("id", post.id);
      await db.from("post_status_events").update({ changed_at: (missed ? new Date(when.getTime() + 2 * HOUR) : postedAt).toISOString() }).eq("post_id", post.id);
      await db
        .from("feed_events")
        .update({ created_at: (missed ? new Date(when.getTime() + 2 * HOUR) : postedAt).toISOString() })
        .eq("post_id", post.id);
      n++;
    }
  }
  return n;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
