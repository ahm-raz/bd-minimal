import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { completenessChecks, completenessScore, completenessTone, type CompletenessContact, type CompletenessLead } from "@/lib/completeness";

type Fixture = { lead: CompletenessLead; contacts: (CompletenessContact & { first_name: string })[] };

const SOURCE = "__source__";

/** 10 fixture leads covering every check, primary-contact rules and edge cases. */
const FIXTURES: Fixture[] = [
  { lead: {}, contacts: [{ first_name: "A" }] },
  {
    lead: { website: "https://a.com", company_linkedin_url: "https://www.linkedin.com/company/a", city: "Austin", state_region: "TX", pain_point: "Missed calls", source_id: SOURCE },
    contacts: [{ first_name: "Maria", is_primary: true, is_decision_maker: true, job_title: "Owner", linkedin_url: "https://www.linkedin.com/in/m", email: "m@a.com", phone: "+15125550100" }],
  },
  { lead: { city: "Austin" }, contacts: [{ first_name: "B", email: "b@x.com" }] },
  { lead: { state_region: "TX", website: "https://b.com" }, contacts: [{ first_name: "C", mobile_phone: "+15125550101" }] },
  // decision maker on a non-primary contact still counts
  { lead: {}, contacts: [{ first_name: "P", is_primary: true }, { first_name: "Q", is_decision_maker: true, email: "q@x.com", job_title: "CEO" }] },
  // primary is the second contact: its fields count, the first's don't
  { lead: {}, contacts: [{ first_name: "First", email: "f@x.com", job_title: "Front desk" }, { first_name: "Second", is_primary: true, linkedin_url: "https://www.linkedin.com/in/s" }] },
  // no primary marked: the first added counts
  { lead: { pain_point: "Slow intake" }, contacts: [{ first_name: "One", phone: "+15125550102" }, { first_name: "Two", email: "t@x.com" }] },
  { lead: { source_id: SOURCE, company_linkedin_url: "https://www.linkedin.com/company/c" }, contacts: [{ first_name: "D", job_title: "Office manager", is_primary: true }] },
  { lead: { website: "https://c.com", city: "Dallas", state_region: "Texas" }, contacts: [{ first_name: "E", is_decision_maker: true, is_primary: true, email: "e@c.com", mobile_phone: "+15125550103" }] },
  { lead: { website: "", city: "", pain_point: "" }, contacts: [{ first_name: "F", email: "", phone: "", job_title: "" }] },
];

function sqlString(v: unknown): string {
  if (v === undefined || v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function databaseScores(): number[] | null {
  let container: string;
  try {
    const cfg = execSync("docker ps --format {{.Names}}", { encoding: "utf8" });
    const name = cfg.split(/\r?\n/).find((n) => n.startsWith("supabase_db_bd-minimal"));
    if (!name) return null;
    container = name;
  } catch {
    return null;
  }

  const user = "99999999-9999-4999-8999-999999999999";
  const lines: string[] = [
    "begin;",
    `insert into auth.users (id, email) values ('${user}', 'completeness-fixture@example.com');`,
  ];
  FIXTURES.forEach((f, i) => {
    const id = `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    const l = f.lead;
    lines.push(
      `insert into public.leads (id, owner_id, created_by, company_name, niche_id, channel_id, website, company_linkedin_url, city, state_region, pain_point, source_id)
       values ('${id}', '${user}', '${user}', 'Fixture ${i + 1}', (select id from niches limit 1), (select id from channels limit 1),
       ${sqlString(l.website)}, ${sqlString(l.company_linkedin_url)}, ${sqlString(l.city)}, ${sqlString(l.state_region)}, ${sqlString(l.pain_point)},
       ${l.source_id ? "(select id from lead_sources limit 1)" : "null"});`,
    );
    f.contacts.forEach((c, j) => {
      lines.push(
        `insert into public.contacts (lead_id, first_name, is_primary, is_decision_maker, job_title, linkedin_url, email, phone, mobile_phone, created_at)
         values ('${id}', ${sqlString(c.first_name)}, ${sqlString(!!c.is_primary)}, ${sqlString(!!c.is_decision_maker)}, ${sqlString(c.job_title)},
         ${sqlString(c.linkedin_url)}, ${sqlString(c.email)}, ${sqlString(c.phone)}, ${sqlString(c.mobile_phone)}, now() + interval '${j} second');`,
      );
    });
  });
  lines.push("select string_agg(completeness::text, ',' order by company_name) from public.leads where created_by = '" + user + "';");
  lines.push("rollback;");

  const out = execSync(`docker exec -i ${container} psql -U postgres -d postgres -At -v ON_ERROR_STOP=1`, {
    input: lines.join("\n"),
    encoding: "utf8",
  });
  const row = out.split(/\r?\n/).find((l) => /^\d+(,\d+)*$/.test(l.trim()));
  if (!row) throw new Error(`Unexpected psql output: ${out}`);
  // "Fixture 1, Fixture 10, Fixture 2, ..." sort order → map back by name
  const names = FIXTURES.map((_, i) => `Fixture ${i + 1}`).sort();
  const values = row.trim().split(",").map(Number);
  const byName = new Map(names.map((n, i) => [n, values[i]!]));
  return FIXTURES.map((_, i) => byName.get(`Fixture ${i + 1}`)!);
}

describe("completeness (TypeScript)", () => {
  it("scores each check at 10 points", () => {
    expect(completenessScore(FIXTURES[0]!.lead, FIXTURES[0]!.contacts)).toBe(0);
    expect(completenessScore(FIXTURES[1]!.lead, FIXTURES[1]!.contacts)).toBe(100);
    expect(completenessScore(FIXTURES[2]!.lead, FIXTURES[2]!.contacts)).toBe(10); // city alone doesn't count
  });

  it("lists missing items with fields to focus", () => {
    const missing = completenessChecks({ city: "Austin" }, [{ is_primary: true }]).filter((c) => !c.done);
    expect(missing.map((m) => m.missingLabel)).toContain("Add a job title");
    expect(missing.find((m) => m.key === "location")?.field).toBe("state_region");
    expect(missing.find((m) => m.key === "job_title")?.field).toBe("contacts.0.job_title");
  });

  it("tone: under 50 red, 50–79 amber, 80+ green", () => {
    expect(completenessTone(40)).toBe("bad");
    expect(completenessTone(50)).toBe("warn");
    expect(completenessTone(79)).toBe("warn");
    expect(completenessTone(80)).toBe("ok");
  });
});

const dbScores = (() => {
  try {
    return databaseScores();
  } catch (e) {
    console.warn("Completeness DB comparison skipped:", (e as Error).message);
    return null;
  }
})();

describe.skipIf(!dbScores)("completeness matches the database", () => {
  it("equals the SQL value on 10 fixture leads", () => {
    const ts = FIXTURES.map((f) => completenessScore(f.lead, f.contacts));
    expect(ts).toEqual(dbScores);
    // sanity: the fixtures cover a spread of scores
    expect(new Set(ts).size).toBeGreaterThan(4);
  });
});
