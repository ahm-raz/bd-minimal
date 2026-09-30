/**
 * Demo data (docs/08 "Demo data").
 *
 *   pnpm db:reset && pnpm seed:demo     LOCAL (refuses unless the database is empty)
 *   pnpm cloud:seed                     CLOUD: erases the linked Supabase Cloud project, then seeds it;
 *                                       Zain, Ahmed and Hina get their real emails (scripts/target.ts)
 *
 * Creates the demo team, targets, campaigns, ~60 leads per BD over the last 21 days, ~3 activities
 * per lead, 12 opportunities (2 won, 2 lost), tasks and one flagged lead. Rows are written with the
 * admin client and explicit created_by / user_id, so triggers credit the right person.
 *
 * Social media module (docs/09 section 8): Hina (social media manager), two LinkedIn accounts, two
 * posting schedules and their posts from two weeks back to a week ahead, in every status.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { TZDate } from "@date-fns/tz";
import type { Database } from "../src/lib/database.types";
import { CLOUD, CORE_EMAILS, PASSWORD, adminClient, appUrl, createFirstOffice, reserveMember, resetDatabase } from "./target";
import { seedSecondOffice } from "./second-office";

const RESET_FIRST = CLOUD || process.argv.includes("--reset");
const emailOf = (m: { key: string; email: string }) =>
  m.key in CORE_EMAILS ? CORE_EMAILS[m.key as keyof typeof CORE_EMAILS] : m.email;

const db: SupabaseClient<Database> = adminClient();
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
  if (res.error || res.data === null || res.data === undefined)
    throw new Error(`${what}: ${res.error?.message ?? "no data"}`);
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

/** The platform owner's demo account (no office). */
const OWNER_EMAIL = CLOUD ? "owner@bd-minimal.example.com" : "owner@example.com";

/** The demo office, set when main() creates it. */
let OFFICE_ID = "";

const TEAM = [
  { key: "zain", name: "Zain Malik", email: "zain@example.com", tz: "Asia/Karachi", niche: null as string | null },
  { key: "ahmed", name: "Ahmed Khan", email: "ahmed@example.com", tz: "Asia/Karachi", niche: "Dental" },
  { key: "sara", name: "Sara Iqbal", email: "sara@example.com", tz: "Asia/Karachi", niche: "Law" },
  { key: "bilal", name: "Bilal Aslam", email: "bilal@example.com", tz: "Europe/Berlin", niche: "AI SaaS" },
  { key: "hina", name: "Hina Raza", email: "hina@example.com", tz: "Asia/Karachi", niche: null },
] as const;

const ROLE_OF: Record<string, string> = { zain: "founder", hina: "social media manager" };

const PLACES = [
  ["Austin", "TX"],
  ["Dallas", "TX"],
  ["Houston", "TX"],
  ["San Antonio", "TX"],
  ["Phoenix", "AZ"],
  ["Denver", "CO"],
  ["San Diego", "CA"],
  ["Sacramento", "CA"],
  ["Miami", "FL"],
  ["Tampa", "FL"],
  ["Atlanta", "GA"],
  ["Charlotte", "NC"],
  ["Nashville", "TN"],
  ["Chicago", "IL"],
  ["Columbus", "OH"],
  ["Seattle", "WA"],
  ["Portland", "OR"],
  ["Boston", "MA"],
] as const;
const TZ: Record<string, string> = {
  TX: "America/Chicago",
  AZ: "America/Phoenix",
  CO: "America/Denver",
  CA: "America/Los_Angeles",
  FL: "America/New_York",
  GA: "America/New_York",
  NC: "America/New_York",
  TN: "America/Chicago",
  IL: "America/Chicago",
  OH: "America/New_York",
  WA: "America/Los_Angeles",
  OR: "America/Los_Angeles",
  MA: "America/New_York",
};

const NAMES: Record<string, { a: string[]; b: string[]; titles: string[]; pain: string[] }> = {
  Dental: {
    a: [
      "Bright Smile",
      "Riverside",
      "Oak Hill",
      "Lakeview",
      "Sunrise",
      "Clinic Pro",
      "Gentle Care",
      "Maple Street",
      "Summit",
      "Harbor",
      "Pinecrest",
      "Cedar Park",
      "Willow Creek",
      "Blue Sky",
      "Evergreen",
      "Northside",
    ],
    b: ["Dental", "Dental Care", "Family Dentistry", "Smiles", "Orthodontics", "Dental Studio", "Pediatric Dentistry"],
    titles: ["Owner", "Practice manager", "Office manager", "Lead dentist", "Front desk"],
    pain: [
      "Missed calls after hours",
      "No-shows for cleanings",
      "Slow new-patient intake",
      "Old website, no online booking",
    ],
  },
  Law: {
    a: [
      "Hartman",
      "Reyes",
      "Whitfield",
      "Castillo",
      "Brennan",
      "Okafor",
      "Lindqvist",
      "Morales",
      "Sutton",
      "Delgado",
      "Keller",
      "Ashford",
      "Prescott",
      "Vance",
      "Holloway",
      "Garrison",
    ],
    b: ["& Cole", "Law Group", "Legal", "& Partners", "Injury Law", "Family Law", "Law Firm"],
    titles: ["Managing partner", "Partner", "Office administrator", "Intake manager", "Paralegal"],
    pain: [
      "Intake calls go to voicemail",
      "Slow case qualification",
      "Manual document collection",
      "No follow-up on web leads",
    ],
  },
  "AI SaaS": {
    a: [
      "Nimbus",
      "Vectorly",
      "Quanta",
      "Lumen",
      "Cortex",
      "Synapse",
      "Prism",
      "Arcadia",
      "Helix",
      "Nova",
      "Orbital",
      "Stratus",
      "Kinetic",
      "Parallel",
      "Beacon",
      "Fathom",
    ],
    b: ["AI", "Labs", "Analytics", "Cloud", "Systems", "Data", "HQ"],
    titles: ["CTO", "Founder", "Head of Engineering", "VP Product", "Engineering manager"],
    pain: [
      "Needs an ML engineer for a pilot",
      "Backlog of integrations",
      "Slow model deployment",
      "No in-house data team",
    ],
  },
};
const FIRST = [
  "Maria",
  "James",
  "Priya",
  "David",
  "Laura",
  "Kevin",
  "Aisha",
  "Daniel",
  "Emily",
  "Carlos",
  "Nora",
  "Ethan",
  "Sofia",
  "Ryan",
  "Grace",
  "Omar",
  "Hannah",
  "Lucas",
  "Chloe",
  "Marcus",
];
const LAST = [
  "Lopez",
  "Patel",
  "Nguyen",
  "Smith",
  "Garcia",
  "Johnson",
  "Kim",
  "Brown",
  "Rossi",
  "Chen",
  "Walker",
  "Hughes",
  "Reed",
  "Foster",
  "Ward",
  "Bennett",
];

async function main() {
  if (RESET_FIRST) await resetDatabase();
  const { count } = await db.from("profiles").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    console.error("The database already has users. Run `pnpm db:reset` first, then `pnpm seed:demo`.");
    process.exit(1);
  }
  console.log("Seeding demo data…");

  // The demo office (docs/11): its default settings, then a reserved place for each member.
  const founder = TEAM.find((m) => m.key === "zain")!;
  OFFICE_ID = await createFirstOffice(db, "BlueBugs Agency", "Asia/Karachi", emailOf(founder));
  for (const m of TEAM) {
    if (m.key !== "zain") await reserveMember(db, emailOf(m), OFFICE_ID, m.key === "hina" ? "social" : "bd");
  }

  const listIds = async (table: "niches" | "channels" | "lead_sources" | "lost_reasons" | "activity_types") => {
    const rows = must(await db.from(table).select("id, name").eq("office_id", OFFICE_ID), table);
    return Object.fromEntries(rows.map((r) => [r.name, r.id])) as Record<string, string>;
  };
  const niches = await listIds("niches");
  const channels = await listIds("channels");
  const sources = await listIds("lead_sources");
  const lostReasons = await listIds("lost_reasons");
  const types = await listIds("activity_types");

  // Users: each joins the demo office with the role reserved above.
  const ids: Record<string, string> = {};
  for (const m of TEAM) {
    const created = await db.auth.admin.createUser({
      email: emailOf(m),
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: m.name },
    });
    if (created.error || !created.data.user) throw new Error(`user ${m.key}: ${created.error?.message}`);
    const user = created.data.user;
    ids[m.key] = user.id;
    must(
      await db
        .from("profiles")
        .update({
          timezone: m.tz,
          primary_niche_id: m.niche ? niches[m.niche] : null,
        })
        .eq("id", user.id)
        .select("id"),
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
    { user_id: ids.hina!, metric: "posts_published" as const, weekly_value: 5 },
  ];
  must(await db.from("targets").insert(targets).select("id"), "targets");

  // Campaigns
  const campaigns = Object.fromEntries(
    must(
      await db
        .from("campaigns")
        .insert([
          { name: "Dental AI Intake", niche_id: niches.Dental, channel_id: channels.LinkedIn, owner_id: ids.ahmed },
          {
            name: "Dental Website Migration",
            niche_id: niches.Dental,
            channel_id: channels.Email,
            owner_id: ids.ahmed,
          },
          { name: "Law AI Intake", niche_id: niches.Law, channel_id: channels.LinkedIn, owner_id: ids.sara },
          {
            name: "AI SaaS Development",
            niche_id: niches["AI SaaS"],
            channel_id: channels.LinkedIn,
            owner_id: ids.bilal,
          },
        ])
        .select("id, name"),
      "campaigns",
    ).map((c) => [c.name, c.id]),
  ) as Record<string, string>;

  type SeededLead = {
    id: string;
    owner: string;
    tz: string;
    company: string;
    createdAt: Date;
    contactId: string;
    channel: string;
    niche: string;
  };
  const seeded: SeededLead[] = [];

  for (const bdKey of ["ahmed", "sara", "bilal"] as const) {
    const bd = TEAM.find((t) => t.key === bdKey)!;
    const niche = bd.niche!;
    const pool = NAMES[niche]!;
    const campaignNames = Object.keys(campaigns).filter((c) =>
      niche === "Dental" ? c.startsWith("Dental") : niche === "Law" ? c.startsWith("Law") : c.startsWith("AI"),
    );
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
            source_id: detailed
              ? sources[pick(["Manual research", "LinkedIn Sales Navigator", "Apollo", "Google Maps"])]
              : null,
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
              linkedin_url: chance(0.7)
                ? `https://www.linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}-${i}${c}`
                : null,
            })
            .select("id")
            .single(),
          "contact",
        );
        if (c === 0) primaryId = contact.id;
      }
      seeded.push({
        id: lead.id,
        owner: ids[bdKey]!,
        tz: bd.tz,
        company,
        createdAt,
        contactId: primaryId,
        channel,
        niche,
      });
    }
  }

  // Founder's own Upwork leads
  const founderNames = new Set<string>();
  for (let i = 0; i < 6; i++) {
    let company = "";
    do
      company = `${pick(["Northwind", "Bluefin", "Keystone", "Ridgeway", "Silverline", "Tidewater"])} ${pick(["Retail", "Logistics", "Health", "Media"])}`;
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
    const contact = must(
      await db
        .from("contacts")
        .insert({ lead_id: lead.id, first_name: pick(FIRST), is_primary: true })
        .select("id")
        .single(),
      "contact",
    );
    seeded.push({
      id: lead.id,
      owner: ids.zain!,
      tz: "Asia/Karachi",
      company,
      createdAt,
      contactId: contact.id,
      channel: "Upwork",
      niche: "Agency Partnerships",
    });
  }

  // Activities: outreach → follow-up → sometimes a reply, with next actions (some overdue)
  const actTime = new Map<string, Date[]>();
  for (const l of seeded) {
    const outreachType =
      l.channel === "Upwork"
        ? "Upwork proposal"
        : l.channel === "Email"
          ? "Cold email"
          : pick(["LinkedIn connection request", "LinkedIn message"]);
    const followType =
      l.channel === "Upwork" ? "Upwork follow-up" : l.channel === "Email" ? "Email follow-up" : "LinkedIn follow-up";
    const ageDays = Math.max(0, Math.floor((Date.now() - l.createdAt.getTime()) / DAY));
    const steps: { type: string; outcome: string; daysAfter: number }[] = [];
    if (chance(0.95))
      steps.push({ type: outreachType, outcome: chance(0.06) ? "bounced" : "no_response", daysAfter: 0 });
    if (steps.length && ageDays >= 1 && chance(0.85))
      steps.push({
        type: followType,
        outcome: "no_response",
        daysAfter: Math.min(ageDays, 1 + Math.floor(rand() * 3)),
      });
    if (steps.length >= 2 && ageDays >= 3 && chance(0.6))
      steps.push({
        type: followType,
        outcome: "no_response",
        daysAfter: Math.min(ageDays, 3 + Math.floor(rand() * 3)),
      });
    if (steps.length >= 2 && ageDays >= 4 && chance(0.4)) {
      steps.push({
        type: "Reply received",
        outcome: pick(["interested", "interested", "not_now", "not_interested", "meeting_booked"]),
        daysAfter: Math.min(ageDays, 5 + Math.floor(rand() * 4)),
      });
    }
    const times: Date[] = [];
    for (const s of steps) {
      const at = new Date(
        Math.min(Date.now() - 60_000, l.createdAt.getTime() + s.daysAfter * DAY + Math.floor(rand() * 3 * 3600_000)),
      );
      must(
        await db
          .from("activities")
          .insert({
            lead_id: l.id,
            user_id: l.owner,
            contact_id: l.contactId,
            activity_type_id: types[s.type]!,
            category: "other",
            outcome_key: s.outcome,
            occurred_at: at.toISOString(),
          })
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
        .update({
          next_action:
            steps.length === 0 ? "Send connection request" : steps.length === 1 ? "Send follow-up" : "Book a call",
          next_action_due: due,
        })
        .eq("id", l.id);
    }
  }

  // Opportunities: 12 across the BDs (2 won: one-time and monthly; 2 lost)
  const replied = seeded.filter((l) => l.owner !== ids.zain).sort(() => rand() - 0.5);
  const plan: {
    stage: string;
    title: string;
    value: number;
    won?: { type: "one_time" | "monthly"; monthly?: number };
    lost?: string;
    daysAgo: number;
  }[] = [
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
      await db
        .from("opportunities")
        .insert({ lead_id: l.id, owner_id: l.owner, created_by: l.owner, title: p.title, estimated_value: p.value })
        .select("id")
        .single(),
      "opportunity",
    );
    for (const stage of path_[p.stage]!) {
      const update: Database["public"]["Tables"]["opportunities"]["Update"] = { stage_key: stage };
      if (stage === "won")
        Object.assign(update, {
          won_value: p.value,
          contract_type: p.won!.type,
          monthly_amount: p.won!.monthly ?? 0,
          won_at: new Date(Date.now() - p.daysAgo * DAY).toISOString(),
        });
      if (stage === "lost")
        Object.assign(update, {
          lost_reason_id: lostReasons[p.lost!],
          lost_at: new Date(Date.now() - p.daysAgo * DAY).toISOString(),
        });
      must(await db.from("opportunities").update(update).eq("id", opp.id).select("id"), `move ${stage}`);
    }
    // Spread the stage history back in time and set time-in-stage (some are stuck 14+ days).
    const events = must(
      await db.from("opportunity_stage_events").select("id").eq("opportunity_id", opp.id).order("id"),
      "events",
    );
    const start = p.daysAgo + events.length * 2;
    for (let e = 0; e < events.length; e++) {
      const at = new Date(Date.now() - Math.max(p.daysAgo, start - e * 2) * DAY);
      await db
        .from("opportunity_stage_events")
        .update({ changed_at: at.toISOString(), changed_by: l.owner })
        .eq("id", events[e]!.id);
    }
    await db
      .from("opportunities")
      .update({
        stage_changed_at: new Date(Date.now() - p.daysAgo * DAY).toISOString(),
        created_at: new Date(Date.now() - start * DAY).toISOString(),
      })
      .eq("id", opp.id);
  }

  // Tasks: one repeating count task per BD, 3 checklist tasks, 1 flagged lead
  const today = (tz: string) => localDate(new Date(), tz);
  for (const k of ["ahmed", "sara", "bilal"] as const) {
    const bd = TEAM.find((t) => t.key === k)!;
    must(
      await db
        .from("task_templates")
        .insert({
          assignee_id: ids[k]!,
          created_by: ids.zain!,
          title: `Add 20 ${bd.niche === "AI SaaS" ? "AI SaaS" : bd.niche!.toLowerCase()} leads`,
          kind: "count",
          metric: "leads_added",
          target_count: 20,
          filter_niche_id: niches[bd.niche!],
          starts_on: today(bd.tz),
        })
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
        {
          assignee_id: ids.ahmed!,
          created_by: ids.zain!,
          title: `Research ${pickLead(ids.ahmed!).company} before the call`,
          kind: "checklist",
          lead_id: pickLead(ids.ahmed!).id,
          due_date: today("Asia/Karachi"),
        },
        {
          assignee_id: ids.sara!,
          created_by: ids.zain!,
          title: "Clean up leads with no next action",
          kind: "checklist",
          due_date: today("Asia/Karachi"),
        },
        {
          assignee_id: ids.bilal!,
          created_by: ids.zain!,
          title: "Update stuck deals",
          kind: "checklist",
          due_date: localDate(new Date(Date.now() - DAY), "Europe/Berlin"),
        },
      ])
      .select("id"),
    "checklist tasks",
  );
  const flagged = seeded.filter((l) => l.owner === ids.ahmed).at(-1)!;
  must(
    await db
      .from("tasks")
      .insert({
        assignee_id: ids.ahmed!,
        created_by: ids.zain!,
        title: "Fix lead: need the owner's name, not front desk",
        kind: "lead_fix",
        lead_id: flagged.id,
        note: "Need the owner's name and direct email.",
        due_date: today("Asia/Karachi"),
      })
      .select("id"),
    "flag",
  );

  // Meetings (docs/10): per BD, one later today, one in 3 days, one held 2 days ago, one cancelled.
  const HOUR = 3_600_000;
  const meetingRows = (["ahmed", "sara", "bilal"] as const).flatMap((k) => {
    const [a, b, c, d] = seeded.filter((l) => l.owner === ids[k]).slice(0, 4);
    const row = (
      l: typeof a,
      startsIn: number,
      extra: Partial<Database["public"]["Tables"]["meetings"]["Insert"]> = {},
    ) => ({
      lead_id: l!.id,
      owner_id: l!.owner,
      created_by: l!.owner,
      contact_id: l!.contactId,
      title: `Discovery call with ${l!.company}`,
      starts_at: new Date(Math.round((Date.now() + startsIn) / (15 * 60_000)) * 15 * 60_000).toISOString(),
      duration_min: 30,
      timezone: "America/Chicago",
      location: "https://meet.google.com/abc-defg-hij",
      reminder_minutes: [30, 10],
      // Bulk inserts send every key for every row (missing ones become null), so set them all.
      status: "scheduled" as Database["public"]["Enums"]["meeting_status"],
      status_note: null as string | null,
      ...extra,
    });
    return a && b && c && d
      ? [
          row(a, 3 * HOUR),
          row(b, 3 * DAY),
          row(c, -2 * DAY, { status: "held" as const }),
          row(d, 2 * DAY, { status: "cancelled" as const, status_note: "They asked to talk next month" }),
        ]
      : [];
  });
  must(await db.from("meetings").insert(meetingRows).select("id"), "meetings");

  await seedSocial(ids);

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

  // Notifications (docs/10): the seed writes as the system, so its own moves have no actor and would
  // read as someone else's. Keep real ones (and missed posts), and leave the newest 5 per person unread.
  must(
    await db.from("notifications").delete().is("actor_id", null).neq("kind", "post_missed").select("id"),
    "notifications cleanup",
  );
  for (const id of Object.values(ids)) {
    const { data: newest } = await db
      .from("notifications")
      .select("id")
      .eq("recipient_id", id!)
      .order("id", { ascending: false })
      .limit(5);
    const keep = (newest ?? []).map((n) => n.id);
    let q = db.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", id!);
    if (keep.length) q = q.not("id", "in", `(${keep.join(",")})`);
    await q;
  }

  // A second, independent office: it never sees BlueBugs' data and BlueBugs never sees its (docs/11).
  const second = await seedSecondOffice(db);

  // The platform owner: a separate account in no office that manages offices on /admin (docs/11 section 2).
  must(await db.from("pending_platform_admins").upsert({ email: OWNER_EMAIL }).select("email"), "owner reservation");
  const owner = await db.auth.admin.createUser({ email: OWNER_EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: "Owner" } });
  if (owner.error) throw new Error(`owner: ${owner.error.message}`);

  console.log(`Done: ${seeded.length} leads, ${plan.length} opportunities, ${meetingRows.length} meetings.`);
  console.log(`Sign in at ${appUrl}/login with any of (BlueBugs Agency):`);
  for (const m of TEAM) console.log(`  ${emailOf(m)} / ${PASSWORD}  (${ROLE_OF[m.key] ?? "BD"})`);
  console.log(`Second office, ${second.name}:`);
  for (const m of second.members) console.log(`  ${m.email} / ${PASSWORD}  (${m.role})`);
  console.log(`Platform owner (Offices dashboard only): ${OWNER_EMAIL} / ${PASSWORD}`);
}

// ---------- Social media module ------------------------------------------------------------

const NY = "America/New_York";

const PAGE_TITLES = [
  "How AI intake cuts missed calls",
  "Case study: 30% more bookings for an Austin dental clinic",
  "3 signs your website is costing you patients",
  "What a law firm learned from 1,000 intake calls",
  "Tip: answer every call in under 5 seconds",
  "Client result: 42 new consults in a month",
  "Why after-hours calls matter more than you think",
  "Our 3-step website migration checklist",
  "Industry news: patients now book online first",
  "Offer: free intake audit for 5 clinics",
  "The cost of a missed call, in dollars",
];
const PROFILE_TITLES = [
  "Lessons from our first 50 clients",
  "Why I started BlueBugs",
  "A day building AI intake",
  "What founders get wrong about follow-ups",
  "Hiring our first social media manager",
  "The one metric I check every morning",
];
const CAPTIONS = [
  "Every missed call is a lost patient. Our AI intake answers every one, books the visit and sends the summary to your front desk.\n\nHere is what changed for one Austin clinic in 30 days.",
  "Most clinics lose 1 in 5 callers after hours. That is not a marketing problem, it is a phone problem.\n\nThree fixes you can make this week.",
  "We tested 12 voice agents on real intake calls. Two sounded human. Here is what made the difference.",
  "Building in public: this week we shipped call summaries straight into the practice calendar.",
];

/** Instant of a local wall-clock time on a local date in `tz` (DST-safe). */
function at(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  return new Date(new TZDate(y, m - 1, d, h, mi, 0, tz).getTime());
}
function addLocalDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const isoDow = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

type PostStatus = Database["public"]["Enums"]["post_status"];
type Walk = { status: PostStatus; postedAt?: Date; caption?: string; changes?: string; results?: boolean };

async function seedSocial(ids: Record<string, string>) {
  const zain = ids.zain!;
  const hina = ids.hina!;
  const pillars = Object.fromEntries(
    must(await db.from("content_pillars").select("id, name").eq("office_id", OFFICE_ID), "pillars").map((p) => [p.name, p.id]),
  ) as Record<string, string>;
  const accounts = must(
    await db
      .from("social_accounts")
      .insert([
        {
          office_id: OFFICE_ID,
          name: "BlueBugs LinkedIn page",
          platform: "linkedin_page",
          profile_url: "https://www.linkedin.com/company/bluebugs",
          audience_timezone: NY,
          sort_order: 1,
        },
        {
          office_id: OFFICE_ID,
          name: "Zain personal LinkedIn",
          platform: "linkedin_profile",
          profile_url: "https://www.linkedin.com/in/zain-malik",
          audience_timezone: NY,
          sort_order: 2,
        },
      ])
      .select("id, name"),
    "social accounts",
  );
  const page = accounts.find((a) => a.name.startsWith("BlueBugs"))!.id;
  const profile = accounts.find((a) => a.name.startsWith("Zain"))!.id;
  const todayNy = localDate(new Date(), NY);
  const startsOn = addLocalDays(todayNy, -21);
  const schedules = must(
    await db
      .from("posting_schedules")
      .insert([
        {
          account_id: page,
          assignee_id: hina,
          weekdays: [1, 3, 5],
          local_time: "09:00",
          timezone: NY,
          default_format: "text",
          needs_approval: true,
          draft_lead_hours: 24,
          starts_on: startsOn,
          created_by: zain,
        },
        {
          account_id: profile,
          assignee_id: hina,
          weekdays: [2, 4],
          local_time: "12:00",
          timezone: NY,
          pillar_id: pillars["Behind the scenes"],
          default_format: "text",
          needs_approval: true,
          draft_lead_hours: 24,
          starts_on: startsOn,
          created_by: zain,
        },
      ])
      .select("id, account_id"),
    "schedules",
  );
  const pageSchedule = schedules.find((x) => x.account_id === page)!.id;
  const profileSchedule = schedules.find((x) => x.account_id === profile)!.id;

  // Every slot from 14 days back to 7 days ahead.
  type Slot = { account: string; schedule: string; when: Date; title: string; pillar: string | null };
  const slots: Slot[] = [];
  let pi = 0;
  let qi = 0;
  const pagePillars = ["Case study", "Tip or how-to", "Client result", "Industry news", "Offer"];
  for (let i = -14; i <= 7; i++) {
    const d = addLocalDays(todayNy, i);
    const dow = isoDow(d);
    if ([1, 3, 5].includes(dow)) {
      slots.push({
        account: page,
        schedule: pageSchedule,
        when: at(d, "09:00", NY),
        title: PAGE_TITLES[pi % PAGE_TITLES.length]!,
        pillar: pillars[pagePillars[pi % pagePillars.length]!] ?? null,
      });
      pi++;
    }
    if ([2, 4].includes(dow)) {
      slots.push({
        account: profile,
        schedule: profileSchedule,
        when: at(d, "12:00", NY),
        title: PROFILE_TITLES[qi % PROFILE_TITLES.length]!,
        pillar: pillars["Behind the scenes"] ?? null,
      });
      qi++;
    }
  }
  const now = Date.now();
  const past = slots.filter((x) => x.when.getTime() + 2 * 3600_000 < now);
  const future = slots.filter((x) => x.when.getTime() + 2 * 3600_000 >= now);

  // Past: mostly on time with results; the 3rd and 7th most recent missed; the 5th posted 3 hours late.
  const plan = new Map<Slot, Walk>();
  [...past].reverse().forEach((slot, i) => {
    const caption = CAPTIONS[i % CAPTIONS.length];
    if (i === 2 || i === 6) plan.set(slot, { status: "missed", caption });
    else if (i === 4)
      plan.set(slot, {
        status: "posted",
        postedAt: new Date(slot.when.getTime() + 3 * 3600_000),
        caption,
        results: true,
      });
    else
      plan.set(slot, {
        status: "posted",
        postedAt: new Date(slot.when.getTime() + Math.floor(rand() * 25) * 60_000),
        caption,
        results: true,
      });
  });
  // Ahead: the next one approved, then two in review, one with changes requested, one drafting; the rest planned.
  const ahead: Walk[] = [
    { status: "approved", caption: CAPTIONS[0] },
    { status: "in_review", caption: CAPTIONS[1] },
    { status: "in_review", caption: CAPTIONS[2] },
    {
      status: "changes_requested",
      caption: CAPTIONS[3],
      changes: "Open with the number, not the story. Keep it under 150 words.",
    },
    { status: "drafting", caption: "Every clinic we audit loses calls at lunch." },
  ];
  future.forEach((slot, i) => plan.set(slot, ahead[i] ?? { status: "planned" }));

  const FLOW: Record<string, PostStatus[]> = {
    planned: [],
    drafting: ["drafting"],
    in_review: ["drafting", "in_review"],
    changes_requested: ["drafting", "in_review", "changes_requested"],
    approved: ["drafting", "in_review", "approved"],
    posted: ["drafting", "in_review", "approved", "posted"],
    missed: ["drafting", "missed"],
  };
  const KIND: Record<string, string> = {
    in_review: "post_submitted",
    approved: "post_approved",
    changes_requested: "changes_requested",
    posted: "post_published",
    missed: "post_missed",
  };

  for (const [slot, walk] of plan) {
    const post = must(
      await db
        .from("posts")
        .insert({
          account_id: slot.account,
          assignee_id: hina,
          created_by: zain,
          schedule_id: slot.schedule,
          title: slot.title,
          pillar_id: slot.pillar,
          format: "text",
          scheduled_at: slot.when.toISOString(),
          timezone: NY,
          needs_approval: true,
          status: "planned",
        })
        .select("id")
        .single(),
      "post",
    );
    for (const to of FLOW[walk.status] ?? []) {
      const update: Database["public"]["Tables"]["posts"]["Update"] = { status: to };
      if (to === "drafting") update.caption = walk.caption;
      if (to === "changes_requested" && walk.changes) {
        must(
          await db
            .from("post_comments")
            .insert({ post_id: post.id, author_id: zain, kind: "change_request", body: walk.changes })
            .select("id"),
          "comment",
        );
      }
      if (to === "approved") {
        must(
          await db
            .from("post_comments")
            .insert({ post_id: post.id, author_id: zain, kind: "approval", body: "Approved." })
            .select("id"),
          "approval",
        );
      }
      if (to === "posted") {
        update.posted_at = walk.postedAt!.toISOString();
        update.post_url = `https://www.linkedin.com/feed/update/urn:li:activity:73${String(Math.floor(rand() * 1e15)).padStart(15, "0")}`;
      }
      must(await db.from("posts").update(update).eq("id", post.id).select("id"), `post ${to}`);
    }
    if (walk.results) {
      const impressions = 400 + Math.floor(rand() * 2200);
      must(
        await db
          .from("posts")
          .update({
            impressions,
            reactions: Math.floor(impressions * (0.02 + rand() * 0.03)),
            comments_count: Math.floor(rand() * 14),
            shares: Math.floor(rand() * 8),
            clicks: Math.floor(rand() * 40),
          })
          .eq("id", post.id)
          .select("id"),
        "results",
      );
      await db
        .from("posts")
        .update({ results_recorded_at: new Date(Math.min(now, walk.postedAt!.getTime() + 2 * DAY)).toISOString() })
        .eq("id", post.id);
    }

    // History and feed at the time the work happened, by the right person.
    const end =
      walk.status === "posted"
        ? walk.postedAt!.getTime()
        : walk.status === "missed"
          ? slot.when.getTime() + 2 * 3600_000
          : now - 3600_000;
    const begin = Math.min(slot.when.getTime() - 3 * DAY, end - 2 * DAY);
    await db
      .from("posts")
      .update({ created_at: new Date(begin).toISOString() })
      .eq("id", post.id);
    const events = must(
      await db.from("post_status_events").select("id, to_status").eq("post_id", post.id).order("id"),
      "events",
    );
    const feed = must(await db.from("feed_events").select("id, kind").eq("post_id", post.id).order("id"), "post feed");
    let fi = 0;
    for (let e = 0; e < events.length; e++) {
      const ev = events[e]!;
      const when = new Date(
        e === events.length - 1 ? end : begin + ((end - begin) * e) / Math.max(1, events.length - 1),
      );
      const by = ["planned", "approved", "changes_requested"].includes(ev.to_status)
        ? zain
        : ev.to_status === "missed"
          ? null
          : hina;
      await db.from("post_status_events").update({ changed_at: when.toISOString(), changed_by: by }).eq("id", ev.id);
      const f = feed[fi];
      if (f && f.kind === KIND[ev.to_status]) {
        await db.from("feed_events").update({ created_at: when.toISOString(), actor_id: by }).eq("id", f.id);
        fi++;
      }
    }
    await db
      .from("post_comments")
      .update({ created_at: new Date(end - 30 * 60_000).toISOString() })
      .eq("post_id", post.id);
  }

  // A one-off post from the founder and an idea from Hina.
  must(
    await db
      .from("posts")
      .insert([
        {
          account_id: page,
          assignee_id: hina,
          created_by: zain,
          title: "Announcing our law firm intake product",
          brief: "Short launch post. Link to the demo video.",
          pillar_id: pillars.Offer,
          format: "video",
          scheduled_at: at(addLocalDays(todayNy, 3), "15:00", NY).toISOString(),
          timezone: NY,
          needs_approval: true,
          status: "planned",
        },
        {
          account_id: page,
          assignee_id: hina,
          created_by: hina,
          title: "Carousel: 5 intake mistakes clinics make",
          brief: "Could reuse the audit findings.",
          pillar_id: pillars["Tip or how-to"],
          format: "carousel",
          scheduled_at: null,
          timezone: NY,
          needs_approval: true,
          status: "idea",
        },
      ])
      .select("id"),
    "one-off posts",
  );

  // Repeating count task: publish today's scheduled posts.
  const hinaToday = localDate(new Date(), "Asia/Karachi");
  must(
    await db
      .from("task_templates")
      .insert({
        assignee_id: hina,
        created_by: zain,
        title: "Publish today's scheduled posts",
        kind: "count",
        metric: "posts_published",
        target_count: 1,
        starts_on: hinaToday,
      })
      .select("id"),
    "social template",
  );
  await db.rpc("ensure_recurring_tasks", { p_user: hina, p_day: hinaToday });
  console.log(`Social: ${plan.size + 2} posts for Hina across 2 accounts.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
