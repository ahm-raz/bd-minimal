import { TEAM, admin, clientAs, ensureTeam, expect, signIn, test } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await ensureTeam();
});

test("a hidden niche disappears from dropdowns but still shows on existing records", async ({ page }) => {
  await signIn(page, "zain");
  await page.goto("/settings/lists");
  const niches = page.getByRole("region", { name: "Niches" });
  await niches.getByRole("button", { name: "Hide Law" }).click();
  await expect(page.getByText("Law hidden")).toBeVisible();
  await expect(niches.getByTestId("list-item-Law").getByText("Hidden")).toBeVisible();

  // Sara's profile still shows Law
  await page.goto("/team");
  await expect(page.getByTestId(`member-${TEAM.sara.email}`).getByText("Law")).toBeVisible();

  // ...but the invite dropdown no longer offers it
  await page.getByRole("button", { name: "Add member" }).click();
  await page.getByLabel("Primary niche").click();
  await expect(page.getByRole("option", { name: "Dental" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Law" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Show it again
  await page.goto("/settings/lists");
  await page.getByRole("region", { name: "Niches" }).getByRole("button", { name: "Show Law" }).click();
  await expect(page.getByText("Law shown")).toBeVisible();
});

test("lists: add and rename inline", async ({ page }) => {
  await signIn(page, "zain");
  await page.goto("/settings/lists");
  const sources = page.getByRole("region", { name: "Lead sources" });
  await sources.getByLabel("New lead source").fill("Conference");
  await sources.getByRole("button", { name: "Add lead source" }).click();
  await expect(sources.getByLabel("Name of Conference")).toBeVisible();
  await sources.getByLabel("Name of Conference").fill("Trade show");
  await sources.getByLabel("Name of Conference").press("Enter");
  await expect(page.getByText("Name saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Lead sources" }).getByLabel("Name of Trade show")).toBeVisible();
});

test("a stage probability change updates the weighted value on the next load", async ({ page }) => {
  const ahmed = await clientAs("ahmed");
  const { data: me } = await ahmed.auth.getUser();
  const { data: niche } = await ahmed.from("niches").select("id").eq("name", "Dental").single();
  const { data: channel } = await ahmed.from("channels").select("id").eq("name", "LinkedIn").single();
  const { data: lead, error } = await ahmed
    .from("leads")
    .insert({ owner_id: me.user!.id, company_name: "Weighted Dental", niche_id: niche!.id, channel_id: channel!.id })
    .select("id")
    .single();
  expect(error).toBeNull();
  await ahmed.from("opportunities").insert({ lead_id: lead!.id, owner_id: me.user!.id, title: "Website", estimated_value: 1000 });

  const weighted = async () => {
    const zain = await clientAs("zain");
    const { data } = await zain.rpc("pipeline_summary");
    return Number(data!.find((r) => r.stage_key === "qualified")!.weighted_value);
  };
  expect(await weighted()).toBe(200);

  await signIn(page, "zain");
  await page.goto("/settings/outcomes");
  const input = page.getByLabel("Probability for Qualified, percent");
  await input.fill("50");
  await input.press("Enter");
  await expect(page.getByText("Probability saved")).toBeVisible();
  expect(await weighted()).toBe(500);

  await page.reload();
  await expect(page.getByLabel("Probability for Qualified, percent")).toHaveValue("50");
  await page.getByLabel("Probability for Qualified, percent").fill("20");
  await page.getByLabel("Probability for Qualified, percent").press("Enter");
  await expect(page.getByText("Probability saved")).toBeVisible();
});

test("targets save on blur and show the daily equivalent", async ({ page }) => {
  await signIn(page, "zain");
  await page.goto("/settings/targets");
  const cell = page.getByLabel(`${TEAM.ahmed.name}: weekly leads added`);
  await cell.fill("112");
  await cell.blur();
  await expect(page.getByText("Target saved")).toBeVisible();
  await expect(page.getByText("22 a day")).toBeVisible();
  const { data } = await admin().from("targets").select("weekly_value").eq("metric", "leads_added");
  expect(data?.map((d) => d.weekly_value)).toContain(112);
});

test("campaigns: add one and see it in the table", async ({ page }) => {
  await signIn(page, "zain");
  await page.goto("/settings/campaigns");
  await page.getByRole("button", { name: "New campaign" }).first().click();
  await page.getByLabel("Name").fill("Dental AI Intake");
  await page.getByLabel("Niche").click();
  await page.getByRole("option", { name: "Dental" }).click();
  await page.getByRole("button", { name: "Add campaign" }).click();
  await expect(page.getByText("Campaign added")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Dental AI Intake", exact: true })).toBeVisible();
});

test("settings writes from a BD session are rejected by the database", async () => {
  const bd = await clientAs("ahmed");

  const insert = await bd.from("niches").insert({ name: "Hacked niche" });
  expect(insert.error?.message).toMatch(/row-level security/);

  const rename = await bd.from("niches").update({ name: "Hacked" }).eq("name", "Dental").select("id");
  expect(rename.error).toBeNull();
  expect(rename.data).toEqual([]);

  const stage = await bd.from("stages").update({ probability: 0.99 }).eq("key", "qualified").select("key");
  expect(stage.data ?? []).toEqual([]);

  const campaign = await bd.from("campaigns").insert({ name: "BD campaign" });
  expect(campaign.error).not.toBeNull();

  const { data: me } = await bd.auth.getUser();
  const target = await bd.from("targets").upsert({ user_id: me.user!.id, metric: "outreach", weekly_value: 1 });
  expect(target.error).not.toBeNull();

  const type = await bd.from("activity_types").update({ category: "outreach" }).eq("name", "Reply received").select("id");
  expect(type.data).toEqual([]);

  // Nothing changed
  const { data: niches } = await admin().from("niches").select("name");
  expect(niches!.map((n) => n.name)).toContain("Dental");
  expect(niches!.map((n) => n.name)).not.toContain("Hacked niche");
  const { data: q } = await admin().from("stages").select("probability").eq("key", "qualified").single();
  expect(Number(q!.probability)).toBe(0.2);
});

test("a BD can't open settings", async ({ page }) => {
  await signIn(page, "ahmed");
  await page.goto("/settings/targets");
  await expect(page).toHaveURL(/\/my-day$/);
});
