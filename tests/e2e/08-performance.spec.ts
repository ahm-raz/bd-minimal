import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";
import { ANON_KEY, SUPABASE_URL } from "./env";
import { PASSWORD, admin, clientAs, ensureTeam, expect, signIn, test, type Who } from "./helpers";

test.describe.configure({ mode: "serial" });

const RUN = Date.now() % 100000;
const NAME = `Nadia Q${RUN}`;
const EMAIL = `nadia${RUN}@example.com`;
let ids: Record<Who, string>;
let nadiaId: string;

async function refId(table: "niches" | "channels" | "activity_types" | "lost_reasons", name: string) {
  const { data } = await admin().from(table).select("id").eq("name", name).single();
  return data!.id;
}

test.beforeAll(async () => {
  ids = await ensureTeam();
  // A fresh BD so every number is known exactly.
  const { data, error } = await admin().auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: NAME } });
  if (error) throw new Error(error.message);
  nadiaId = data.user!.id;
  await admin().from("profiles").update({ timezone: "Asia/Karachi" }).eq("id", nadiaId);

  const nadia = createClient<Database>(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await nadia.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  const niche = await refId("niches", "Dental");
  const channel = await refId("channels", "LinkedIn");
  const lead = async (company_name: string, extra: Record<string, unknown>) => {
    const { data: l, error: e } = await nadia
      .from("leads")
      .insert({ owner_id: nadiaId, company_name, niche_id: niche, channel_id: channel, ...extra })
      .select("id")
      .single();
    if (e) throw new Error(e.message);
    return l.id;
  };
  // leads added 3; completeness 20, 10, 0 → average 10
  const a = await lead(`Perf A ${RUN}`, { website: "https://a.example.com", company_linkedin_url: "https://www.linkedin.com/company/a" });
  const b = await lead(`Perf B ${RUN}`, { city: "Austin", state_region: "TX" });
  const c = await lead(`Perf C ${RUN}`, {});

  const log = async (leadId: string, type: string, outcome: string) => {
    const { error: e } = await nadia.rpc("log_activity", { p_lead_id: leadId, p_activity_type_id: await refId("activity_types", type), p_outcome_key: outcome });
    if (e) throw new Error(e.message);
  };
  // outreach 4, follow-ups 2, replies 3 (positive 2), meetings booked 1
  await log(a, "LinkedIn message", "no_response");
  await log(b, "LinkedIn message", "no_response");
  await log(c, "Cold email", "no_response");
  await log(c, "LinkedIn connection request", "bounced");
  await log(a, "LinkedIn follow-up", "no_response");
  await log(b, "Email follow-up", "no_response");
  await log(a, "Reply received", "interested");
  await log(a, "Reply received", "meeting_booked");
  await log(b, "Reply received", "not_interested");

  // pipeline: A goes meeting done → proposal → won monthly; B is lost
  const { data: oa } = await nadia.from("opportunities").insert({ lead_id: a, owner_id: nadiaId, title: "Intake", estimated_value: 5000 }).select("id").single();
  await nadia.from("opportunities").update({ stage_key: "meeting_done" }).eq("id", oa!.id);
  await nadia.from("opportunities").update({ stage_key: "proposal_sent" }).eq("id", oa!.id);
  await nadia.from("opportunities").update({ stage_key: "won", won_value: 5000, contract_type: "monthly", monthly_amount: 400 }).eq("id", oa!.id);
  const { data: ob } = await nadia.from("opportunities").insert({ lead_id: b, owner_id: nadiaId, title: "Website", estimated_value: 2000 }).select("id").single();
  await nadia.from("opportunities").update({ stage_key: "lost", lost_reason_id: await refId("lost_reasons", "Price") }).eq("id", ob!.id);

  // flagged 1
  const zain = await clientAs("zain");
  await zain.from("tasks").insert({ assignee_id: nadiaId, created_by: ids.zain, title: "Fix lead: owner name", kind: "lead_fix", lead_id: c, due_date: new Date().toISOString().slice(0, 10) });
});

test("the scoreboard shows exactly the seeded numbers", async ({ page }) => {
  await signIn(page, "zain");
  await page.goto("/performance?range=today");
  const row = page.getByTestId(`score-${NAME}`);
  await expect(row).toBeVisible();
  const expected: Record<string, string> = {
    leads_added: "3",
    outreach: "4",
    follow_ups: "2",
    replies: "3",
    positive_replies: "2",
    meetings_booked: "1",
    meetings_done: "1",
    proposals_sent: "1",
    won_count: "1",
    won_revenue: "$5,000",
    new_mrr: "$400",
    avg_completeness: "10%",
    flagged_leads: "1",
  };
  for (const [key, value] of Object.entries(expected)) {
    await expect(row.getByTestId(`cell-${key}`), key).toHaveText(value);
  }

  // Every number drills down to its records
  await row.getByTestId("cell-outreach").getByRole("button").click();
  await expect(page.getByTestId("drilldown-rows").getByRole("listitem")).toHaveCount(4);
  await page.keyboard.press("Escape");

  // Clicking the person filters the page to them; the summary follows
  await row.getByRole("button", { name: NAME, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`person=${nadiaId}`));
  const summary = page.getByTestId("summary");
  await expect(summary).toContainText("Reply rate 75%");
  await expect(summary).toContainText("win rate 50%");
  await expect(summary).toContainText("Proposal rate 100%");
  await expect(page.getByTestId("funnel")).toContainText("75%");
});

test("a BD sees only their own numbers, even by editing the URL", async ({ page }) => {
  await signIn(page, "ahmed");
  await page.goto(`/performance?range=today&person=${nadiaId}`);
  await expect(page.getByRole("heading", { name: "Your performance" })).toBeVisible();
  await expect(page.getByTestId("scoreboard")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Person" })).toHaveCount(0);
  await expect(page.getByText(`Perf A ${RUN}`)).toHaveCount(0);

  const ahmed = await clientAs("ahmed");
  const { data } = await ahmed.rpc("metrics_scoreboard", { p_from: new Date(Date.now() - 86_400_000).toISOString(), p_to: new Date(Date.now() + 86_400_000).toISOString() });
  expect(data!.map((r) => r.user_id)).toEqual([ids.ahmed]);
  const { data: daily } = await ahmed.rpc("metrics_daily", { p_from: "2026-01-01", p_to: "2026-01-02", p_tz: "UTC", p_user: nadiaId });
  expect(daily).toEqual([]);
});

test("changing the range updates the numbers", async ({ page }) => {
  await signIn(page, "zain");
  await page.goto(`/performance?range=yesterday&person=${nadiaId}`);
  await expect(page.getByTestId("summary")).toContainText("Leads added0");
  await page.goto(`/performance?range=this_month&person=${nadiaId}`);
  await expect(page.getByTestId("summary")).toContainText("Leads added3");
});
