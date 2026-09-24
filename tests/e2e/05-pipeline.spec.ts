import type { Page } from "@playwright/test";
import { admin, clientAs, ensureTeam, expect, signIn, test, type Who } from "./helpers";

test.describe.configure({ mode: "serial" });

let ids: Record<Who, string>;
const RUN = Date.now() % 100000;
test.beforeAll(async () => {
  ids = await ensureTeam();
});

async function refId(table: "niches" | "channels", name: string) {
  const { data } = await admin().from(table).select("id").eq("name", name).single();
  return data!.id;
}

async function leadWithOpp(who: Who, company: string, title: string, value = 3500) {
  const c = await clientAs(who);
  const { data: lead, error } = await c
    .from("leads")
    .insert({ owner_id: ids[who], company_name: company, niche_id: await refId("niches", "Dental"), channel_id: await refId("channels", "LinkedIn") })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await c.from("contacts").insert({ lead_id: lead.id, first_name: "Maria", is_primary: true, email: "m@x.com" });
  const { data: opp } = await c.from("opportunities").insert({ lead_id: lead.id, owner_id: ids[who], title, estimated_value: value }).select("id").single();
  return { leadId: lead.id, oppId: opp!.id };
}

async function drag(page: Page, cardTitle: string, stage: string) {
  const card = page.getByTestId(`card-${cardTitle}`);
  const column = page.getByTestId(`column-${stage}`);
  await card.scrollIntoViewIfNeeded();
  const from = (await card.boundingBox())!;
  const to = (await column.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 5, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 12 });
  await page.mouse.up();
}

async function stageOf(oppId: string) {
  const { data } = await admin().from("opportunities").select("stage_key, owner_id").eq("id", oppId).single();
  return data!;
}

test("dragging a card moves it immediately, persists, and records history", async ({ page }) => {
  const title = `Intake ${RUN}`;
  const { oppId } = await leadWithOpp("ahmed", `Drag Dental ${RUN}`, title);
  await signIn(page, "ahmed");
  await page.goto("/pipeline");
  await expect(page.getByTestId("column-qualified").getByTestId(`card-${title}`)).toBeVisible();
  await drag(page, title, "meeting_done");
  await expect(page.getByTestId("column-meeting_done").getByTestId(`card-${title}`)).toBeVisible();
  await expect.poll(async () => (await stageOf(oppId)).stage_key).toBe("meeting_done");
  await page.reload();
  await expect(page.getByTestId("column-meeting_done").getByTestId(`card-${title}`)).toBeVisible();

  // side panel shows each move with date and user
  await page.getByTestId(`card-${title}`).click();
  const history = page.getByTestId("stage-history");
  await expect(history.getByRole("listitem")).toHaveCount(2);
  await expect(history.getByRole("listitem").first()).toContainText("Meeting done");
  await expect(history.getByRole("listitem").first()).toContainText("Ahmed Khan");
});

test("cancelling Won returns the card; confirming marks it won and the lead becomes a customer", async ({ page }) => {
  const title = `Won flow ${RUN}`;
  const { leadId, oppId } = await leadWithOpp("ahmed", `Won Dental ${RUN}`, title, 3500);
  await signIn(page, "ahmed");
  await page.goto("/pipeline");
  await drag(page, title, "won");
  const dialog = page.getByRole("dialog", { name: `Mark ${title} as won` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Final value")).toHaveValue("3500");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("column-qualified").getByTestId(`card-${title}`)).toBeVisible();
  expect((await stageOf(oppId)).stage_key).toBe("qualified");

  await drag(page, title, "won");
  await dialog.getByRole("button", { name: "Mark as won" }).click();
  await expect(dialog.getByText("Pick a contract type.")).toBeVisible();
  await dialog.getByRole("combobox", { name: "Contract type" }).click();
  await page.getByRole("option", { name: "Monthly" }).click();
  await dialog.getByRole("button", { name: "Mark as won" }).click();
  await expect(dialog.getByText("Enter the monthly amount.")).toBeVisible();
  await dialog.getByLabel("Monthly amount").fill("300");
  await dialog.getByRole("button", { name: "Mark as won" }).click();
  await expect(page.getByTestId("column-won").getByTestId(`card-${title}`)).toBeVisible();
  const { data } = await admin().from("opportunities").select("stage_key, won_value, contract_type, monthly_amount, won_at").eq("id", oppId).single();
  expect(data).toMatchObject({ stage_key: "won", contract_type: "monthly" });
  expect(Number(data!.won_value)).toBe(3500);
  expect(Number(data!.monthly_amount)).toBe(300);
  const { data: lead } = await admin().from("leads").select("status").eq("id", leadId).single();
  expect(lead!.status).toBe("customer");

  // moving it back asks first
  await drag(page, title, "negotiation");
  const confirm = page.getByRole("dialog", { name: `Move ${title} back to Negotiation?` });
  await expect(confirm).toContainText("This will remove it from won revenue.");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("column-won").getByTestId(`card-${title}`)).toBeVisible();
});

test("Lost needs a reason; cancel returns the card", async ({ page }) => {
  const title = `Lost flow ${RUN}`;
  const { leadId, oppId } = await leadWithOpp("ahmed", `Lost Dental ${RUN}`, title);
  await signIn(page, "ahmed");
  await page.goto("/pipeline");
  await drag(page, title, "lost");
  const dialog = page.getByRole("dialog", { name: `Mark ${title} as lost` });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("column-qualified").getByTestId(`card-${title}`)).toBeVisible();

  await drag(page, title, "lost");
  await dialog.getByRole("button", { name: "Mark as lost" }).click();
  await expect(dialog.getByText("Pick a reason.")).toBeVisible();
  await dialog.getByRole("combobox", { name: "Reason" }).click();
  await page.getByRole("option", { name: "Timing" }).click();
  await dialog.getByLabel("Note").fill("Budget next quarter");
  await dialog.getByRole("button", { name: "Mark as lost" }).click();
  await expect(page.getByTestId("column-lost").getByTestId(`card-${title}`)).toBeVisible();
  expect((await stageOf(oppId)).stage_key).toBe("lost");
  const { data: lead } = await admin().from("leads").select("status").eq("id", leadId).single();
  expect(lead!.status).toBe("lost");
});

test("the lead page stage dropdown moves the opportunity", async ({ page }) => {
  const title = `Dropdown ${RUN}`;
  const { leadId, oppId } = await leadWithOpp("ahmed", `Dropdown Dental ${RUN}`, title);
  await signIn(page, "ahmed");
  await page.goto(`/leads/${leadId}`);
  await page.getByRole("combobox", { name: `Stage of ${title}` }).click();
  await page.getByRole("option", { name: "Proposal sent" }).click();
  await expect.poll(async () => (await stageOf(oppId)).stage_key).toBe("proposal_sent");
  await expect(page.getByTestId("timeline-stage").first()).toContainText("Proposal sent");
});

test("reassigning a lead moves its open opportunity but not a won one", async ({ page }) => {
  const openTitle = `Open deal ${RUN}`;
  const { leadId, oppId: openId } = await leadWithOpp("ahmed", `Reassign Dental ${RUN}`, openTitle, 2000);
  const c = await clientAs("ahmed");
  const { data: won } = await c
    .from("opportunities")
    .insert({ lead_id: leadId, owner_id: ids.ahmed, title: `Won deal ${RUN}`, estimated_value: 5000 })
    .select("id")
    .single();
  await c.from("opportunities").update({ stage_key: "won", won_value: 5000, contract_type: "one_time" }).eq("id", won!.id);

  const zain = await clientAs("zain");
  await zain.from("leads").update({ owner_id: ids.sara }).eq("id", leadId);
  expect((await stageOf(openId)).owner_id).toBe(ids.sara);
  expect((await stageOf(won!.id)).owner_id).toBe(ids.ahmed);

  // Founder's owner filter shows it the same way
  await signIn(page, "zain");
  await page.goto(`/pipeline?owner=${ids.sara}`);
  await expect(page.getByTestId(`card-${openTitle}`)).toBeVisible();
  await expect(page.getByTestId(`card-Won deal ${RUN}`)).toHaveCount(0);
  await page.goto(`/pipeline?owner=${ids.ahmed}`);
  await expect(page.getByTestId(`card-Won deal ${RUN}`)).toBeVisible();
  await expect(page.getByTestId(`card-${openTitle}`)).toHaveCount(0);

  // Ahmed no longer sees the open one; Sara does
  await signIn(page, "ahmed");
  await page.goto("/pipeline");
  await expect(page.getByTestId(`card-${openTitle}`)).toHaveCount(0);
  await signIn(page, "sara");
  await page.goto("/pipeline");
  await expect(page.getByTestId(`card-${openTitle}`)).toBeVisible();
});

test("list view sorts by value", async ({ page }) => {
  await signIn(page, "ahmed");
  await page.goto("/pipeline?view=list");
  const values = await page.locator("tbody tr td:nth-child(4)").allInnerTexts();
  const nums = values.map((v) => Number(v.replace(/[$,]/g, "")));
  expect(nums).toEqual([...nums].sort((a, b) => b - a));
  await page.getByRole("button", { name: "Value" }).click();
  const asc = (await page.locator("tbody tr td:nth-child(4)").allInnerTexts()).map((v) => Number(v.replace(/[$,]/g, "")));
  expect(asc).toEqual([...asc].sort((a, b) => a - b));
});
