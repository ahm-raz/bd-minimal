import { expect, test } from "./helpers";

test("the UI review page renders the design system", async ({ page }) => {
  await page.goto("/dev/ui");
  await expect(page.getByRole("heading", { name: "UI review" })).toBeVisible();
  await expect(page.getByRole("meter").first()).toBeVisible();
  // pace states: ahead, behind, far behind
  await expect(page.locator('[data-pace="ahead"]')).toHaveCount(1);
  await expect(page.locator('[data-pace="behind"]')).toHaveCount(1);
  await expect(page.locator('[data-pace="far_behind"]')).toHaveCount(1);
  await page.getByRole("button", { name: "New lead" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/my-day");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/leads?status=new");
  await expect(page).toHaveURL(/\/login\?next=%2Fleads%3Fstatus%3Dnew$/);
});
