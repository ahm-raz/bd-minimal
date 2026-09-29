import { ensureTeam, expect, signIn, test } from "./helpers";

/** Founder's department switcher: the whole app follows All / Sales / Social media (src/lib/department.ts). */
test.beforeAll(async () => {
  await ensureTeam();
});

test("the founder switches the app between departments", async ({ page }) => {
  await signIn(page, "zain");
  const nav = page.getByRole("navigation", { name: "Main" }).first();
  const switcher = page.getByTestId("department-switcher").first();
  await expect(switcher).toContainText("All departments");
  await expect(nav.getByRole("link", { name: /Leads/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Content/ })).toBeVisible();

  // Social media: sales pages leave the nav, and a sales link sends you back with a note.
  await switcher.click();
  await page.getByRole("menuitemradio", { name: "Social media" }).click();
  await expect(switcher).toContainText("Social media");
  await expect(nav.getByRole("link", { name: /Leads/ })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: /Pipeline/ })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: /Content/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Today so far" })).toHaveCount(0);

  await page.goto("/leads");
  await page.waitForURL(/\/my-day/);
  await expect(page.getByText("That page isn't part of the department you're viewing.")).toBeVisible();

  await page.goto("/feed");
  const types = page.getByRole("group", { name: "Event types" });
  await expect(types.getByRole("button")).toHaveText(["Tasks", "Social"]);

  await page.goto("/settings/lists");
  const tabs = page.getByRole("navigation", { name: "Settings" });
  await expect(tabs.getByRole("link", { name: "Outcomes and stages" })).toHaveCount(0);
  await expect(tabs.getByRole("link", { name: "Content pillars" })).toBeVisible();

  // Sales: the reverse.
  await switcher.click();
  await page.getByRole("menuitemradio", { name: "Sales" }).click();
  await expect(switcher).toContainText("Sales");
  await expect(nav.getByRole("link", { name: /Content/ })).toHaveCount(0);
  await expect(tabs.getByRole("link", { name: "Content pillars" })).toHaveCount(0);
  await page.goto("/performance");
  await expect(page.getByRole("navigation", { name: "Performance" })).toHaveCount(0);

  // All departments: everything is back, and the choice survives a reload.
  await switcher.click();
  await page.getByRole("menuitemradio", { name: "All departments" }).click();
  await expect(nav.getByRole("link", { name: /Leads/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Content/ })).toBeVisible();
  await page.reload();
  await expect(switcher).toContainText("All departments");
});

test("BDs have no switcher", async ({ page }) => {
  await signIn(page, "ahmed");
  await expect(page.getByRole("link", { name: /Leads/ }).first()).toBeVisible();
  await expect(page.getByTestId("department-switcher")).toHaveCount(0);
});
