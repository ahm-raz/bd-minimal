/**
 * Demo data (docs/08 "Demo data"). Local only.
 *
 *   pnpm db:reset && pnpm seed:demo
 *
 * Creates the demo team, targets, campaigns, ~60 leads per BD over the last 21 days, ~3 activities
 * per lead, 12 opportunities (2 won, 2 lost), tasks and one flagged lead. Rows are written with the
 * admin client and explicit created_by / user_id, so triggers credit the right person.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
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
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(URL_)) {
  console.error(`Refusing to seed: NEXT_PUBLIC_SUPABASE_URL (${URL_ || "not set"}) is not a local Supabase.`);
  process.exit(1);
}
if (!KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

const db: SupabaseClient<Database> = createClient<Database>(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const PASSWORD = "demo-password-123";
const DAY = 86_400_000;

// Deterministic randomness so every seed looks the same.
let seed = 42;
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const chance = (p: number) => rand() < p;

function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error || res.data === null || res.data === undefined) throw new Error(`${what}: ${res.error?.message ?? "no data"}`);
  return res.data as NonNullable<T>;
}

const localDate = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);

/** A working-hours instant `daysAgo` days back in the member's zone (09:30–17:30 local). */
function workTime(daysAgo: number, tz: string): Date {
  const base = new Date(Date.now() - daysAgo * DAY);
  const offsetHours = tz === "Europe/Berlin" ? 2 : 5;
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 9 - offsetHours, 30));
  d.setUTCMinutes(d.getUTCMinutes() + Math.floor(rand() * 8 * 60));
  return d > new Date() ? new Date(Date.now() - Math.floor(rand() * 3600_000)) : d;
}

const TEAM = [
  { key: "zain", name: "Zain Malik", email: "zain@example.com", tz: "Asia/Karachi", niche: null as string | null },
  { key: "ahmed", name: "Ahmed Khan", email: "ahmed@example.com", tz: "Asia/Karachi", niche: "Dental" },
  { key: "sara", name: "Sara Iqbal", email: "sara@example.com", tz: "Asia/Karachi", niche: "Law" },
  { key: "bilal", name: "Bilal Aslam", email: "bilal@example.com", tz: "Europe/Berlin", niche: "AI SaaS" },
] as const;

const PLACES = [
  ["Austin", "TX"], ["Dallas", "TX"], ["Houston", "TX"], ["San Antonio", "TX"], ["Phoenix", "AZ"], ["Denver", "CO"],
  ["San Diego", "CA"], ["Sacramento", "CA"], ["Miami", "FL"], ["Tampa", "FL"], ["Atlanta", "GA"], ["Charlotte", "NC"],
  ["Nashville", "TN"], ["Chicago", "IL"], ["Columbus", "OH"], ["Seattle", "WA"], ["Portland", "OR"], ["Boston", "MA"],
] as const;
const TZ: Record<string, string> = {
  TX: "America/Chicago", AZ: "America/Phoenix", CO: "America/Denver", CA: "America/Los_Angeles", FL: "America/New_York",
  GA: "America/New_York", NC: "America/New_York", TN: "America/Chicago", IL: "America/Chicago", OH: "America/New_York",
  WA: "America/Los_Angeles", OR: "America/Los_Angeles", MA: "America/New_York",
};

const NAMES: Record<string, { a: string[]; b: string[]; titles: string[]; pain: string[] }> = {
  Dental: {
    a: ["Bright Smile", "Riverside", "Oak Hill", "Lakeview", "Sunrise", "Clinic Pro", "Gentle Care", "Maple Street", "Summit", "Harbor", "Pinecrest", "Cedar Park", "Willow Creek", "Blue Sky", "Evergreen", "Northside"],
    b: ["Dental", "Dental Care", "Family Dentistry", "Smiles", "Orthodontics", "Dental Studio", "Pediatric Dentistry"],
    titles: ["Owner", "Practice manager", "Office manager", "Lead dentist", "Front desk"],
    pain: ["Missed calls after hours", "No-shows for cleanings", "Slow new-patient intake", "Old website, no online booking"],
  },
  Law: {
    a: ["Hartman", "Reyes", "Whitfield", "Castillo", "Brennan", "Okafor", "Lindqvist", "Morales", "Sutton", "Delgado", "Keller", "Ashford", "Prescott", "Vance", "Holloway", "Garrison"],
    b: ["& Cole", "Law Group", "Legal", "& Partners", "Injury Law", "Family Law", "Law Firm"],
    titles: ["Managing partner", "Partner", "Office administrator", "Intake manager", "Paralegal"],
    pain: ["Intake calls go to voicemail", "Slow case qualification", "Manual document collection", "No follow-up on web leads"],
  },
  "AI SaaS": {
    a: ["Nimbus", "Vectorly", "Quanta", "Lumen", "Cortex", "Synapse", "Prism", "Arcadia", "Helix", "Nova", "Orbital", "Stratus", "Kinetic", "Parallel", "Beacon", "Fathom"],
    b: ["AI", "Labs", "Analytics", "Cloud", "Systems", "Data", "HQ"],
    titles: ["CTO", "Founder", "Head of Engineering", "VP Product", "Engineering manager"],
    pain: ["Needs an ML engineer for a pilot", "Backlog of integrations", "Slow model deployment", "No in-house data team"],
  },
};
const FIRST = ["Maria", "James", "Priya", "David", "Laura", "Kevin", "Aisha", "Daniel", "Emily", "Carlos", "Nora", "Ethan", "Sofia", "Ryan", "Grace", "Omar", "Hannah", "Lucas", "Chloe", "Marcus"];
const LAST = ["Lopez", "Patel", "Nguyen", "Smith", "Garcia", "Johnson", "Kim", "Brown", "Rossi", "Chen", "Walker", "Hughes", "Reed", "Foster", "Ward", "Bennett"];

async function main() {
  const { count } = await db.from("profiles").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    console.error("The database already has users. Run `pnpm db:reset` first, then `pnpm seed:demo`.");
    process.exit(1);
  }
  console.log("Seeding demo data…");

  const listIds = async (table: "niches" | "channels" | "lead_sources" | "lost_reasons" | "activity_types") => {
    const rows = must(await db.from(table).select("id, name"), table);
    return Object.fromEntries(rows.map((r) => [r.name, r.id])) as Record<string, string>;
  };
  const niches = await listIds("niches");
  const channels = await listIds("channels");
  const sources = await listIds("lead_sources");
  const lostReasons = await listIds("lost_reasons");
  const types = await listIds("activity_types");

  // Users: the first created becomes the founder (trigger).
  const ids: Record<string, string> = {};
  for (const m of TEAM) {
    const created = await db.auth.admin.createUser({ email: m.email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: m.name } });
    if (created.error || !created.data.user) throw new Error(`user ${m.key}: ${created.error?.message}`);
    const user = created.data.user;
    ids[m.key] = user.id;
    must(
      await db.from("profiles").update({ timezone: m.tz, primary_niche_id: m.niche ? niches[m.niche] : null }).eq("id", user.id).select("id"),
      `profile ${m.key}`,
    );
  }

  // Targets
  const targets = [
    ...["ahmed", "sara", "bilal"].flatMap((k) => [
      { user_id: ids[k]!, metric: "leads_added" as const, weekly_value: 112 },
      { user_id: ids[k]!, metric: "outreach" as const, weekly_value: 75 },
      { user_id: ids[k]!, metric: "follow_ups" as const, weekly_value: 100 },
      { user_id: ids[k]!, metric: "meetings_booked" as const, weekly_value: 3 },
    ]),
    { user_id: ids.zain!, metric: "outreach" as const, weekly_value: 25 },
  ];
  must(await db.from("targets").insert(targets).select("id"), "targets");

  // Campaigns
  const campaigns = Object.fromEntries(
    must(
      await db
        .from("campaigns")
        .insert([
          { name: "Dental AI Intake", niche_id: niches.Dental, channel_id: channels.LinkedIn, owner_id: ids.ahmed },
          { name: "Dental Website Migration", niche_id: niches.Dental, channel_id: channels.Email, owner_id: ids.ahmed },
          { name: "Law AI Intake", niche_id: niches.Law, channel_id: channels.LinkedIn, owner_id: ids.sara },
          { name: "AI SaaS Development", niche_id: niches["AI SaaS"], channel_id: channels.LinkedIn, owner_id: ids.bilal },
        ])
        .select("id, name"),
      "campaigns",
    ).map((c) => [c.name, c.id]),
  ) as Record<string, string>;

  type SeededLead = { id: string; owner: string; tz: string; company: string; createdAt: Date; contactId: string; channel: string; niche: string };
  const seeded: SeededLead[] = [];

  for (const bdKey of ["ahmed", "sara", "bilal"] as const) {
    const bd = TEAM.find((t) => t.key === bdKey)!;
    const niche = bd.niche!;
    const pool = NAMES[niche]!;
    const campaignNames = Object.keys(campaigns).filter((c) => (niche === "Dental" ? c.startsWith("Dental") : niche === "Law" ? c.startsWith("Law") : c.startsWith("AI")));
    const used = new Set<string>();
    for (let i = 0; i < 60; i++) {
      // spread over 21 days, fewer on weekends
      let daysAgo = Math.floor(rand() * 21);
      const dow = new Date(Date.now() - daysAgo * DAY).getUTCDay();
      if ((dow === 0 || dow === 6) && chance(0.8)) daysAgo = Math.max(0, daysAgo - 2);
      let company = `${pick(pool.a)} ${pick(pool.b)}`;
      while (used.has(company)) company = `${pick(pool.a)} ${pick(pool.b)}`;
      used.add(company);
      const [city, state] = pick(PLACES);
      const detailed = chance(0.65); // some deliberately incomplete
      const channel = niche === "Law" && chance(0.4) ? "Email" : "LinkedIn";
      const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const createdAt = workTime(daysAgo, bd.tz);
      const lead = must(
        await db
          .from("leads")
          .insert({
            owner_id: ids[bdKey]!,
            created_by: ids[bdKey]!,
            company_name: company,
            website: detailed || chance(0.4) ? `https://${slug}.com` : null,
            company_linkedin_url: detailed && chance(0.7) ? `https://www.linkedin.com/company/${slug}` : null,
            company_phone: chance(0.5) ? `+1512555${String(1000 + i).slice(-4)}` : null,
            city: detailed || chance(0.5) ? city : null,
            state_region: detailed || chance(0.5) ? state : null,
            lead_timezone: TZ[state] ?? null,
            google_rating: niche === "AI SaaS" ? null : Math.round((3.8 + rand() * 1.2) * 10) / 10,
            google_review_count: niche === "AI SaaS" ? null : Math.floor(20 + rand() * 300),
            niche_id: niches[niche]!,
            channel_id: channels[channel]!,
            source_id: detailed ? sources[pick(["Manual research", "LinkedIn Sales Navigator", "Apollo", "Google Maps"])] : null,
            campaign_id: chance(0.7) ? campaigns[pick(campaignNames)] : null,
            priority: pick(["high", "medium", "medium", "low"] as const),
            pain_point: detailed && chance(0.8) ? pick(pool.pain) : null,
            tags: chance(0.3) ? [state.toLowerCase()] : [],
            created_at: createdAt.toISOString(),
          })
          .select("id")
          .single(),
        "lead",
      );
      const nContacts = 1 + (chance(0.5) ? 1 : 0) + (chance(0.2) ? 1 : 0);
      let primaryId = "";
      for (let c = 0; c < nContacts; c++) {
        const first = pick(FIRST);
        const last = pick(LAST);
        const contact = must(
          await db
            .from("contacts")
            .insert({
              lead_id: lead.id,
              first_name: c === 0 && niche === "Dental" ? `Dr. ${first}` : first,
              last_name: last,
              job_title: detailed || c > 0 ? pool.titles[c % pool.titles.length]! : null,
              is_primary: c === 0,
              is_decision_maker: c === 0 && detailed,
              email: detailed || chance(0.5) ? `${first.toLowerCase()}@${slug}.com` : null,
              email_status: detailed ? "valid" : "unverified",
              phone: detailed && chance(0.6) ? `+1512556${String(1000 + i * 3 + c).slice(-4)}` : null,
              linkedin_url: chance(0.7) ? `https://www.linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}-${i}${c}` : null,
            })
            .select("id")
            .single(),
          "contact",
        );
        if (c === 0) primaryId = contact.id;
      }
      seeded.push({ id: lead.id, owner: ids[bdKey]!, tz: bd.tz, company, createdAt, contactId: primaryId, channel, niche });
    }
  }

  // Founder's own Upwork leads
  const founderNames = new Set<string>();
  for (let i = 0; i < 6; i++) {
    let company = "";
    do company = `${pick(["Northwind", "Bluefin", "Keystone", "Ridgeway", "Silverline", "Tidewater"])} ${pick(["Retail", "Logistics", "Health", "Media"])}`;
    while (founderNames.has(company));
    founderNames.add(company);
    const createdAt = workTime(Math.floor(rand() * 10), "Asia/Karachi");
    const lead = must(
      await db
        .from("leads")
        .insert({
          owner_id: ids.zain!,
          created_by: ids.zain!,
          company_name: company,
          upwork_job_url: `https://www.upwork.com/jobs/~01${String(4000 + i)}`,
          niche_id: niches["Agency Partnerships"]!,
          channel_id: channels.Upwork!,
          source_id: sources["Upwork job post"],
          created_at: createdAt.toISOString(),
        })
        .select("id")
        .single(),
      "founder lead",
    );
    const contact = must(await db.from("contacts").insert({ lead_id: lead.id, first_name: pick(FIRST), is_primary: true }).select("id").single(), "contact");
    seeded.push({ id: lead.id, owner: ids.zain!, tz: "Asia/Karachi", company, createdAt, contactId: contact.id, channel: "Upwork", niche: "Agency Partnerships" });
  }

  // Activities: outreach → follow-up → sometimes a reply, with next actions (some overdue)
  const actTime = new Map<string, Date[]>();
  for (const l of seeded) {
    const outreachType = l.channel === "Upwork" ? "Upwork proposal" : l.channel === "Email" ? "Cold email" : pick(["LinkedIn connection request", "LinkedIn message"]);
    const followType = l.channel === "Upwork" ? "Upwork follow-up" : l.channel === "Email" ? "Email follow-up" : "LinkedIn follow-up";
    const ageDays = Math.max(0, Math.floor((Date.now() - l.createdAt.getTime()) / DAY));
    const steps: { type: string; outcome: string; daysAfter: number }[] = [];
    if (chance(0.95)) steps.push({ type: outreachType, outcome: chance(0.06) ? "bounced" : "no_response", daysAfter: 0 });
    if (steps.length && ageDays >= 1 && chance(0.85)) steps.push({ type: followType, outcome: "no_response", daysAfter: Math.min(ageDays, 1 + Math.floor(rand() * 3)) });
    if (steps.length >= 2 && ageDays >= 3 && chance(0.6)) steps.push({ type: followType, outcome: "no_response", daysAfter: Math.min(ageDays, 3 + Math.floor(rand() * 3)) });
    if (steps.length >= 2 && ageDays >= 4 && chance(0.4)) {
      steps.push({ type: "Reply received", outcome: pick(["interested", "interested", "not_now", "not_interested", "meeting_booked"]), daysAfter: Math.min(ageDays, 5 + Math.floor(rand() * 4)) });
    }
    const times: Date[] = [];
    for (const s of steps) {
      const at = new Date(Math.min(Date.now() - 60_000, l.createdAt.getTime() + s.daysAfter * DAY + Math.floor(rand() * 3 * 3600_000)));
      must(
        await db
          .from("activities")
          .insert({ lead_id: l.id, user_id: l.owner, contact_id: l.contactId, activity_type_id: types[s.type]!, category: "other", outcome_key: s.outcome, occurred_at: at.toISOString() })
          .select("id")
          .single(),
        "activity",
      );
      times.push(at);
    }
    actTime.set(l.id, times);
    // next action: most leads have one; some overdue, some none
    const last = steps[steps.length - 1];
    if (last?.outcome !== "not_interested" && chance(0.85)) {
      const dueOffset = pick([-3, -2, -1, 0, 0, 1, 2, 3, 5, 7]);
      const due = localDate(new Date(Date.now() + dueOffset * DAY), l.tz);
      await db
        .from("leads")
        .update({ next_action: steps.length === 0 ? "Send connection request" : steps.length === 1 ? "Send follow-up" : "Book a call", next_action_due: due })
        .eq("id", l.id);
    }
  }

  // Opportunities: 12 across the BDs (2 won: one-time and monthly; 2 lost)
  const replied = seeded.filter((l) => l.owner !== ids.zain).sort(() => rand() - 0.5);
  const plan: { stage: string; title: string; value: number; won?: { type: "one_time" | "monthly"; monthly?: number }; lost?: string; daysAgo: number }[] = [
    { stage: "qualified", title: "AI patient intake setup", value: 3500, daysAgo: 3 },
    { stage: "qualified", title: "Website migration", value: 2400, daysAgo: 16 },
    { stage: "meeting_done", title: "Intake automation", value: 4200, daysAgo: 5 },
    { stage: "meeting_done", title: "Voice agent pilot", value: 6000, daysAgo: 18 },
    { stage: "proposal_sent", title: "AI intake + follow-ups", value: 5500, daysAgo: 2 },
    { stage: "proposal_sent", title: "Data pipeline build", value: 9000, daysAgo: 6 },
    { stage: "negotiation", title: "ML engineer, 3 months", value: 18000, daysAgo: 4 },
    { stage: "negotiation", title: "Case intake chatbot", value: 4800, daysAgo: 15 },
    { stage: "won", title: "Website rebuild", value: 3500, won: { type: "one_time" }, daysAgo: 6 },
    { stage: "won", title: "AI intake with support", value: 3500, won: { type: "monthly", monthly: 300 }, daysAgo: 2 },
    { stage: "lost", title: "SEO retainer", value: 1500, lost: "Price", daysAgo: 8 },
    { stage: "lost", title: "Integration sprint", value: 7000, lost: "Timing", daysAgo: 3 },
  ];
  const path_: Record<string, string[]> = {
    qualified: [],
    meeting_done: ["meeting_done"],
    proposal_sent: ["meeting_done", "proposal_sent"],
    negotiation: ["meeting_done", "proposal_sent", "negotiation"],
    won: ["meeting_done", "proposal_sent", "negotiation", "won"],
    lost: ["meeting_done", "lost"],
  };
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i]!;
    const l = replied[i]!;
    const opp = must(
      await db.from("opportunities").insert({ lead_id: l.id, owner_id: l.owner, created_by: l.owner, title: p.title, estimated_value: p.value }).select("id").single(),
      "opportunity",
    );
    for (const stage of path_[p.stage]!) {
      const update: Database["public"]["Tables"]["opportunities"]["Update"] = { stage_key: stage };
      if (stage === "won") Object.assign(update, { won_value: p.value, contract_type: p.won!.type, monthly_amount: p.won!.monthly ?? 0, won_at: new Date(Date.now() - p.daysAgo * DAY).toISOString() });
      if (stage === "lost") Object.assign(update, { lost_reason_id: lostReasons[p.lost!], lost_at: new Date(Date.now() - p.daysAgo * DAY).toISOString() });
      must(await db.from("opportunities").update(update).eq("id", opp.id).select("id"), `move ${stage}`);
    }
    // Spread the stage history back in time and set time-in-stage (some are stuck 14+ days).
    const events = must(await db.from("opportunity_stage_events").select("id").eq("opportunity_id", opp.id).order("id"), "events");
    const start = p.daysAgo + events.length * 2;
    for (let e = 0; e < events.length; e++) {
      const at = new Date(Date.now() - Math.max(p.daysAgo, start - e * 2) * DAY);
      await db.from("opportunity_stage_events").update({ changed_at: at.toISOString(), changed_by: l.owner }).eq("id", events[e]!.id);
    }
    await db.from("opportunities").update({ stage_changed_at: new Date(Date.now() - p.daysAgo * DAY).toISOString(), created_at: new Date(Date.now() - start * DAY).toISOString() }).eq("id", opp.id);
  }

  // Tasks: one repeating count task per BD, 3 checklist tasks, 1 flagged lead
  const today = (tz: string) => localDate(new Date(), tz);
  for (const k of ["ahmed", "sara", "bilal"] as const) {
    const bd = TEAM.find((t) => t.key === k)!;
    must(
      await db
        .from("task_templates")
        .insert({ assignee_id: ids[k]!, created_by: ids.zain!, title: `Add 20 ${bd.niche === "AI SaaS" ? "AI SaaS" : bd.niche!.toLowerCase()} leads`, kind: "count", metric: "leads_added", target_count: 20, filter_niche_id: niches[bd.niche!], starts_on: today(bd.tz) })
        .select("id"),
      "template",
    );
    await db.rpc("ensure_recurring_tasks", { p_user: ids[k]!, p_day: today(bd.tz) });
  }
  const pickLead = (owner: string) => seeded.find((l) => l.owner === owner)!;
  must(
    await db
      .from("tasks")
      .insert([
        { assignee_id: ids.ahmed!, created_by: ids.zain!, title: `Research ${pickLead(ids.ahmed!).company} before the call`, kind: "checklist", lead_id: pickLead(ids.ahmed!).id, due_date: today("Asia/Karachi") },
        { assignee_id: ids.sara!, created_by: ids.zain!, title: "Clean up leads with no next action", kind: "checklist", due_date: today("Asia/Karachi") },
        { assignee_id: ids.bilal!, created_by: ids.zain!, title: "Update stuck deals", kind: "checklist", due_date: localDate(new Date(Date.now() - DAY), "Europe/Berlin") },
      ])
      .select("id"),
    "checklist tasks",
  );
  const flagged = seeded.filter((l) => l.owner === ids.ahmed).at(-1)!;
  must(
    await db
      .from("tasks")
      .insert({ assignee_id: ids.ahmed!, created_by: ids.zain!, title: "Fix lead: need the owner's name, not front desk", kind: "lead_fix", lead_id: flagged.id, note: "Need the owner's name and direct email.", due_date: today("Asia/Karachi") })
      .select("id"),
    "flag",
  );

  // Put feed events at the time the work happened (triggers stamped them "now").
  const feed = must(await db.from("feed_events").select("id, kind, lead_id").order("id"), "feed");
  const seen = new Map<string, number>();
  for (const e of feed) {
    const lead = seeded.find((l) => l.id === e.lead_id);
    if (!lead) continue;
    let at: Date | null = null;
    if (e.kind === "lead_created") at = lead.createdAt;
    if (e.kind === "activity_logged") {
      const n = seen.get(lead.id) ?? 0;
      seen.set(lead.id, n + 1);
      at = actTime.get(lead.id)?.[n] ?? null;
    }
    if (at) await db.from("feed_events").update({ created_at: at.toISOString() }).eq("id", e.id);
  }

  console.log(`Done: ${seeded.length} leads, ${plan.length} opportunities.`);
  console.log("Sign in at http://localhost:3000/login with any of:");
  for (const m of TEAM) console.log(`  ${m.email} / ${PASSWORD}  (${m.key === "zain" ? "founder" : "BD"})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
