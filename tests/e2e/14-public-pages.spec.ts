import { ensureTeam, expect, signIn, test } from "./helpers";

/** Public pages for Google OAuth verification (docs/07 section 0). */
test.beforeAll(async () => {
  await ensureTeam();
});

test("signed out, / is the public homepage and /terms loads; signed in, / goes to My Day", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Client Acquisition OS" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  await expect(page.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");

  await page.getByRole("link", { name: "Terms" }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { level: 1, name: "Terms" })).toBeVisible();

  // Other routes stay private.
  await page.goto("/leads");
  await expect(page).toHaveURL(/\/login/);

  await signIn(page, "ahmed");
  await page.goto("/");
  await expect(page).toHaveURL(/\/my-day/);
});
