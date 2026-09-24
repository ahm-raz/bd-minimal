import { admin, clientAs, ensureTeam, expect, signIn, test, type Who } from "./helpers";

test.describe.configure({ mode: "serial" });

let ids: Record<Who, string>;
const RUN = Date.now() % 100000;
test.beforeAll(async () => {
  ids = await ensureTeam();
});

async function addLead(who: Who, company: string) {
  const c = await clientAs(who);
  const { data: niche } = await admin().from("niches").select("id").eq("name", "Dental").single();
  const { data: channel } = await admin().from("channels").select("id").eq("name", "LinkedIn").single();
  const { data, error } = await c
    .from("leads")
    .insert({ owner_id: ids[who], company_name: company, city: "Austin", state_region: "TX", niche_id: niche!.id, channel_id: channel!.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

test("a BD's event appears on the founder's open feed within seconds, without refreshing", async ({ page }) => {
  await signIn(page, "zain");
  await page.goto("/feed");
  await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
  await page.waitForTimeout(1500); // let the Realtime channel subscribe
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));

  const company = `Live Feed Dental ${RUN}`;
  const started = Date.now();
  await addLead("ahmed", company);
  await expect(page.getByTestId("feed").getByText(`added lead ${company} (Austin, TX)`)).toBeVisible({ timeout: 5000 });
  const elapsed = Date.now() - started;
  expect(elapsed).toBeLessThan(5000);
  await expect(page.getByTestId("feed-row").first()).toContainText("Ahmed");
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
});

test("new events while scrolled down show an N new pill", async ({ page }) => {
  // enough rows to scroll
  for (let i = 0; i < 25; i++) await addLead("sara", `Scroll Law ${RUN}-${i}`);
  await signIn(page, "zain");
  await page.goto("/feed");
  await page.waitForTimeout(1500);
  await page.mouse.wheel(0, 2000);
  await page.waitForFunction(() => window.scrollY > 200);
  await addLead("ahmed", `Pill Dental ${RUN}`);
  await expect(page.getByTestId("new-pill")).toHaveText(/1 new/, { timeout: 5000 });
  await page.getByTestId("new-pill").click();
  await expect(page.getByTestId("feed-row").first()).toContainText(`Pill Dental ${RUN}`);
});

test("filters by person and event type, kept in the URL", async ({ page }) => {
  await signIn(page, "zain");
  await page.goto(`/feed?person=${ids.sara}&types=leads`);
  const rows = page.getByTestId("feed-row");
  await expect(rows.first()).toContainText("Sara");
  const texts = await rows.allInnerTexts();
  expect(texts.every((t) => t.includes("added lead") && t.includes("Sara"))).toBe(true);
  await page.getByRole("button", { name: "Flags", exact: true }).click();
  await expect(page).toHaveURL(/types=leads%2Cflags|types=leads,flags/);
});

test("hover actions: Open and Flag lead", async ({ page }) => {
  const company = `Hover Dental ${RUN}`;
  const leadId = await addLead("ahmed", company);
  await signIn(page, "zain");
  await page.goto(`/feed?person=${ids.ahmed}`);
  const row = page.getByTestId("feed-row").filter({ hasText: `added lead ${company}` });
  await row.hover();
  await row.getByRole("button", { name: "Flag lead" }).click();
  const dialog = page.getByRole("dialog", { name: `Flag ${company}` });
  await dialog.getByLabel("What needs fixing").fill("Add the decision maker");
  await dialog.getByRole("button", { name: "Flag lead" }).click();
  await expect(page.getByText("Lead flagged.")).toBeVisible();
  await expect(page.getByTestId("feed").getByText(`flagged lead ${company}`)).toBeVisible({ timeout: 5000 });

  await row.hover();
  await row.getByRole("link", { name: "Open" }).click();
  await page.waitForURL(new RegExp(`/leads/${leadId}`));
});

test("a BD session gets no feed rows", async ({ page }) => {
  const ahmed = await clientAs("ahmed");
  const { data, error } = await ahmed.from("feed_events").select("id").limit(10);
  expect(error).toBeNull();
  expect(data).toEqual([]);
  const { count } = await admin().from("feed_events").select("id", { count: "exact", head: true });
  expect(count).toBeGreaterThan(0);

  await signIn(page, "ahmed");
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/my-day/);
});
