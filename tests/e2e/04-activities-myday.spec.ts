import type { Page } from "@playwright/test";
import { addDays, todayIn } from "../../src/lib/dates";
import { admin, clientAs, ensureTeam, expect, signIn, test, type Who } from "./helpers";

test.describe.configure({ mode: "serial" });

let ids: Record<Who, string>;
test.beforeAll(async () => {
  ids = await ensureTeam();
});

async function refId(table: "niches" | "channels", name: string) {
  const { data } = await admin().from(table).select("id").eq("name", name).single();
  return data!.id;
}

/** Create a lead as a user (so created_by and RLS are real), with one contact. */
async function makeLead(who: Who, company: string, extra: Record<string, unknown> = {}) {
  const c = await clientAs(who);
  const { data, error } = await c
    .from("leads")
    .insert({
      owner_id: ids[who],
      company_name: company,
      niche_id: await refId("niches", "Dental"),
      channel_id: await refId("channels", "LinkedIn"),
      ...extra,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await c.from("contacts").insert({ lead_id: data.id, first_name: "Maria", last_name: "Lopez", is_primary: true, email: `m@${company.replace(/\W/g, "").toLowerCase()}.com` });
  return data.id;
}

async function typeId(name: string) {
  const { data } = await admin().from("activity_types").select("id").eq("name", name).single();
  return data!.id;
}

async function status(leadId: string) {
  const { data } = await admin().from("leads").select("status").eq("id", leadId).single();
  return data!.status;
}

async function chooseType(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Type", exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
async function chooseOutcome(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Outcome", exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}

test("status follows the docs/04 table as activities are logged", async ({ page }) => {
  const lead = await makeLead("ahmed", "Status Flow Dental");
  expect(await status(lead)).toBe("new");

  await signIn(page, "ahmed");
  await page.goto(`/leads/${lead}`);
  await page.keyboard.press("l");
  const sheet = page.getByRole("dialog", { name: "Log activity" });
  await expect(sheet.getByRole("combobox", { name: "Type", exact: true })).toContainText("LinkedIn connection request");
  await expect(sheet.getByRole("combobox", { name: "Outcome", exact: true })).toContainText("No response");
  // outreach never offers reply outcomes
  await chooseOutcome(page, "No response");

  // next action is required
  await sheet.getByRole("button", { name: "Log activity" }).click();
  await expect(sheet.getByText("Say what the next step is, or tick No next step.")).toBeVisible();
  await sheet.getByLabel("What's next").fill("Send DM");
  await sheet.getByRole("button", { name: "Tomorrow" }).click();
  await sheet.getByRole("button", { name: "Log activity" }).click();
  await expect(page.getByText("Activity logged")).toBeVisible();
  await expect(page.getByRole("button", { name: /Status: Contacted/ })).toBeVisible();
  await expect(page.getByTestId("timeline-activity").first()).toContainText("LinkedIn connection request");
  expect(await status(lead)).toBe("contacted");

  // Reply received defaults to Interested → Replied
  await page.getByRole("button", { name: /^Log activity/ }).click();
  await chooseType(page, "Reply received");
  await expect(page.getByRole("combobox", { name: "Outcome", exact: true })).toContainText("Interested");
  await page.getByRole("dialog", { name: "Log activity" }).getByLabel("No next step").click();
  await page.getByRole("dialog", { name: "Log activity" }).getByRole("button", { name: "Log activity" }).click();
  await expect(page.getByRole("button", { name: /Status: Replied/ })).toBeVisible();

  // Meeting booked → "Create an opportunity?" → Qualified
  await page.getByRole("button", { name: /^Log activity/ }).click();
  await chooseType(page, "Reply received");
  await chooseOutcome(page, "Meeting booked");
  await page.getByRole("dialog", { name: "Log activity" }).getByLabel("What's next").fill("Prepare for the call");
  await page.getByRole("dialog", { name: "Log activity" }).getByRole("button", { name: "+3 days" }).click();
  await page.getByRole("dialog", { name: "Log activity" }).getByRole("button", { name: "Log activity" }).click();
  const prompt = page.getByRole("dialog", { name: "Create an opportunity for Status Flow Dental?" });
  await expect(prompt).toBeVisible();
  await prompt.getByLabel("Title").fill("AI patient intake setup");
  await prompt.getByLabel("Estimated value").fill("3500");
  await prompt.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Opportunity created")).toBeVisible();
  await expect(page.getByRole("button", { name: /Status: Qualified/ })).toBeVisible();

  // An activity never overrides Qualified
  const c = await clientAs("ahmed");
  await c.rpc("log_activity", { p_lead_id: lead, p_activity_type_id: await typeId("Reply received"), p_outcome_key: "not_interested" });
  expect(await status(lead)).toBe("qualified");

  // Won → Customer
  const { data: opp } = await admin().from("opportunities").select("id").eq("lead_id", lead).single();
  await c.from("opportunities").update({ stage_key: "won", won_value: 3500, contract_type: "one_time" }).eq("id", opp!.id);
  expect(await status(lead)).toBe("customer");
});

test("remaining status rules: reply, not interested, lost, manual statuses", async () => {
  const c = await clientAs("ahmed");
  const reply = await typeId("Reply received");
  const outreach = await typeId("Cold email");

  // New + Not now reply → Replied (any reply except Not interested)
  const a = await makeLead("ahmed", "Reply Rule Dental");
  await c.rpc("log_activity", { p_lead_id: a, p_activity_type_id: reply, p_outcome_key: "not_now" });
  expect(await status(a)).toBe("replied");
  // Not interested outcome → Not interested
  await c.rpc("log_activity", { p_lead_id: a, p_activity_type_id: reply, p_outcome_key: "not_interested" });
  expect(await status(a)).toBe("not_interested");

  // An inbound reply on a New lead with a non-reply outcome doesn't mark it Contacted
  const b = await makeLead("ahmed", "Lost Rule Dental");
  await c.rpc("log_activity", { p_lead_id: b, p_activity_type_id: outreach, p_outcome_key: "bounced" });
  expect(await status(b)).toBe("contacted");
  // Its only opportunity lost → Lost
  const { data: opp } = await c.from("opportunities").insert({ lead_id: b, owner_id: ids.ahmed, title: "Website", estimated_value: 1000 }).select("id").single();
  expect(await status(b)).toBe("qualified");
  const { data: reason } = await admin().from("lost_reasons").select("id").eq("name", "Price").single();
  await c.from("opportunities").update({ stage_key: "lost", lost_reason_id: reason!.id }).eq("id", opp!.id);
  expect(await status(b)).toBe("lost");

  // Manual: Bad fit is never overridden by an activity; Nurture is
  const d = await makeLead("ahmed", "Manual Rule Dental");
  await c.from("leads").update({ status: "bad_fit" }).eq("id", d);
  await c.rpc("log_activity", { p_lead_id: d, p_activity_type_id: reply, p_outcome_key: "interested" });
  expect(await status(d)).toBe("bad_fit");
  await c.from("leads").update({ status: "nurture" }).eq("id", d);
  await c.rpc("log_activity", { p_lead_id: d, p_activity_type_id: reply, p_outcome_key: "interested" });
  expect(await status(d)).toBe("replied");
});

test("activities can be backdated up to 7 days, not more", async ({ page }) => {
  const lead = await makeLead("ahmed", "Backdate Dental");
  const tz = "Asia/Karachi";
  const fmt = (d: Date) => {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
    const g = (t: string) => p.find((x) => x.type === t)!.value;
    return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
  };
  await signIn(page, "ahmed");
  await page.goto(`/leads/${lead}`);
  await page.getByRole("button", { name: /^Log activity/ }).click();
  const sheet = page.getByRole("dialog", { name: "Log activity" });
  await sheet.getByLabel("No next step").click();
  await sheet.getByLabel("When").fill(fmt(new Date(Date.now() - 8 * 86_400_000)));
  await sheet.getByRole("button", { name: "Log activity" }).click();
  await expect(sheet.getByText("You can backdate up to 7 days.")).toBeVisible();

  const sixDaysAgo = new Date(Date.now() - 6 * 86_400_000);
  await sheet.getByLabel("When").fill(fmt(sixDaysAgo));
  await sheet.getByRole("button", { name: "Log activity" }).click();
  await expect(page.getByText("Activity logged")).toBeVisible();
  const { data } = await admin().from("activities").select("occurred_at").eq("lead_id", lead).single();
  expect(Math.abs(new Date(data!.occurred_at).getTime() - sixDaysAgo.getTime())).toBeLessThan(90_000);
});

test("overdue and today follow-ups use the user's time zone (Berlin)", async ({ page }) => {
  const berlinToday = todayIn("Europe/Berlin");
  await makeLead("bilal", "Berlin Overdue AI", { next_action: "Send case study", next_action_due: addDays(berlinToday, -1) });
  await makeLead("bilal", "Berlin Today AI", { next_action: "Call back", next_action_due: berlinToday });
  await makeLead("bilal", "Berlin Later AI", { next_action: "Check in", next_action_due: addDays(berlinToday, 3) });

  await signIn(page, "bilal");
  await page.goto("/my-day");
  const rows = page.getByTestId("follow-ups").getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Berlin Overdue AI");
  await expect(rows.nth(0)).toContainText("Due yesterday");
  await expect(rows.nth(1)).toContainText("Berlin Today AI");
  await expect(rows.nth(1)).toContainText("Due today");
  await expect(page.getByText("Overdue 1")).toBeVisible();
  await expect(page.getByText("Today 1")).toBeVisible();

  await page.getByRole("button", { name: /Coming up/ }).click();
  await expect(page.getByTestId("coming-up")).toContainText("Berlin Later AI");
});

test("logging from a follow-up row updates the row and counters without a reload", async ({ page }) => {
  const today = todayIn("Asia/Karachi");
  const company = `Row Log Law ${Date.now() % 100000}`;
  await makeLead("sara", company, { next_action: "Send DM", next_action_due: today });
  const c = await clientAs("zain");
  await c.from("targets").upsert({ user_id: ids.sara, metric: "outreach", weekly_value: 75 }, { onConflict: "user_id,metric" });

  await signIn(page, "sara");
  await page.goto("/my-day");
  const before = Number((await page.getByTestId("counter-outreach").innerText()).match(/(\d+) \/ 15/)![1]);
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
  await page.getByRole("button", { name: `Log activity for ${company}` }).click();
  const sheet = page.getByRole("dialog", { name: "Log activity" });
  await expect(sheet.getByRole("combobox", { name: "Contact" })).toContainText("Maria Lopez");
  await sheet.getByLabel("What's next").fill("Follow up");
  await sheet.getByRole("button", { name: "+3 days" }).click();
  await sheet.getByRole("button", { name: "Log activity" }).click();
  await expect(page.getByText("Activity logged")).toBeVisible();
  await expect(page.getByTestId(`follow-up-${company}`)).toHaveCount(0);
  await expect(page.getByTestId("counter-outreach")).toContainText(`${before + 1} / 15`);
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);

  // drill-down lists the activity behind the number
  await page.getByTestId("counter-outreach").click();
  await expect(page.getByTestId("drilldown-rows")).toContainText(company);
});

test("logging Proposal sent offers to move the only open opportunity", async ({ page }) => {
  const lead = await makeLead("ahmed", "Proposal Prompt Dental");
  const c = await clientAs("ahmed");
  await c.from("opportunities").insert({ lead_id: lead, owner_id: ids.ahmed, title: "Website rebuild", estimated_value: 2000 });
  await signIn(page, "ahmed");
  await page.goto(`/leads/${lead}`);
  await page.getByRole("button", { name: /^Log activity/ }).click();
  await chooseType(page, "Proposal sent");
  await expect(page.getByRole("combobox", { name: "Outcome", exact: true })).toContainText("Done");
  await page.getByRole("dialog", { name: "Log activity" }).getByLabel("No next step").click();
  await page.getByRole("dialog", { name: "Log activity" }).getByRole("button", { name: "Log activity" }).click();
  const prompt = page.getByRole("dialog", { name: "Move Website rebuild to Proposal sent?" });
  await prompt.getByRole("button", { name: "Move to Proposal sent" }).click();
  await expect(page.getByText("Moved to Proposal sent")).toBeVisible();
  const { data } = await admin().from("opportunities").select("stage_key").eq("lead_id", lead).single();
  expect(data!.stage_key).toBe("proposal_sent");
  await expect(page.getByTestId("timeline-stage").first()).toContainText("Proposal sent");
});

test("BDs can edit their own activity for 24 hours, then it locks", async ({ page }) => {
  const lead = await makeLead("ahmed", "Edit Window Dental");
  const c = await clientAs("ahmed");
  const { data: id } = await c.rpc("log_activity", { p_lead_id: lead, p_activity_type_id: await typeId("Cold email"), p_outcome_key: "no_response" });
  await signIn(page, "ahmed");
  await page.goto(`/leads/${lead}`);
  await page.getByRole("button", { name: "Actions for Cold email" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByLabel("Notes").fill("Sent the intake one-pager");
  await page.getByRole("button", { name: "Save activity" }).click();
  await expect(page.getByText("Activity saved")).toBeVisible();

  await admin().from("activities").update({ created_at: new Date(Date.now() - 25 * 3600_000).toISOString() }).eq("id", id!);
  await page.reload();
  await expect(page.getByRole("button", { name: "Actions for Cold email" })).toHaveCount(0);
});

test("keyboard shortcuts: N, /, G then L, G then M", async ({ page }) => {
  await signIn(page, "ahmed");
  await page.goto("/my-day");
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog", { name: "New lead" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "New lead" })).toBeHidden();
  await page.keyboard.press("g");
  await page.keyboard.press("l");
  await page.waitForURL(/\/leads$/);
  await page.keyboard.press("/");
  await expect(page.getByLabel("Search leads")).toBeFocused();
  await page.getByLabel("Search leads").press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("g");
  await page.keyboard.press("m");
  await page.waitForURL(/\/my-day$/);
});
