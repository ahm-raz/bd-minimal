import type { Page } from "@playwright/test";
import { formatLocalDate, todayIn } from "../../src/lib/dates";
import { PASSWORD, TEAM, clearInbox, expect, latestEmailLink, signIn, test } from "./helpers";

test.describe.configure({ mode: "serial" });

async function pickTimezone(page: Page, label: string, tz: string) {
  await page.getByLabel(label).click();
  await page.getByPlaceholder("Search time zones").fill(tz);
  await page.getByRole("option", { name: tz.replace(/_/g, " ") }).first().click();
}

test("the founder is created via /setup, and /setup then returns 404", async ({ page }) => {
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Create the founder account" })).toBeVisible();
  await page.getByLabel("Name").fill(TEAM.zain.name);
  await page.getByLabel("Email").fill(TEAM.zain.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create founder account" }).click();
  await page.waitForURL(/\/my-day/);
  await expect(page.getByRole("heading", { name: "My Day" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Team/ })).toBeVisible();

  const res = await page.goto("/setup");
  expect(res?.status()).toBe(404);
  await page.context().clearCookies();
  const res2 = await page.goto("/setup");
  expect(res2?.status()).toBe(404);
});

test("an invited BD sets a password from the email and lands on My Day", async ({ page, browser }) => {
  await clearInbox();
  await signIn(page, "zain");
  await page.goto("/team");
  await page.getByRole("button", { name: "Invite member" }).click();
  await page.getByLabel("Full name").fill(TEAM.ahmed.name);
  await page.getByLabel("Email").fill(TEAM.ahmed.email);
  await page.getByLabel("Primary niche").click();
  await page.getByRole("option", { name: "Dental" }).click();
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText(`Invite sent to ${TEAM.ahmed.email}`)).toBeVisible();

  const row = page.getByTestId(`member-${TEAM.ahmed.email}`);
  await expect(row.getByText("Invited")).toBeVisible();
  await expect(row.getByText("Dental")).toBeVisible();

  const link = await latestEmailLink(TEAM.ahmed.email, /href="([^"]*\/auth\/confirm[^"]*)"/);
  const ctx = await browser.newContext();
  const bd = await ctx.newPage();
  await bd.goto(link);
  await expect(bd).toHaveURL(/\/accept-invite/);
  await expect(bd.getByRole("heading", { name: "Welcome, Ahmed." })).toBeVisible();
  await expect(bd.getByText("Set a password to start.")).toBeVisible();

  await bd.getByLabel("Password", { exact: true }).fill("short");
  await bd.getByLabel("Confirm password").fill("short");
  await bd.getByRole("button", { name: "Set password" }).click();
  await expect(bd.getByText("Use at least 10 characters.")).toBeVisible();

  await bd.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await bd.getByLabel("Confirm password").fill(PASSWORD);
  await bd.getByRole("button", { name: "Set password" }).click();
  await bd.waitForURL(/\/my-day/);
  await expect(bd.getByRole("heading", { name: "My Day" })).toBeVisible();
  // BDs don't see founder-only navigation
  await expect(bd.getByRole("link", { name: /Team/ })).toHaveCount(0);
  await ctx.close();

  await page.reload();
  await expect(page.getByTestId(`member-${TEAM.ahmed.email}`).getByText("Active")).toBeVisible();
});

test("a BD opening founder pages is redirected to My Day", async ({ page }) => {
  await signIn(page, "ahmed");
  for (const path of ["/team", "/feed", "/settings"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/my-day$/);
  }
  await expect(page.getByText("That page is for the founder.").first()).toBeVisible();
});

test("wrong credentials show the login error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEAM.ahmed.email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
});

test("changing time zone updates the displayed date", async ({ page }) => {
  await signIn(page, "ahmed");
  const now = new Date();
  const karachi = todayIn("Asia/Karachi", now);
  await expect(page.getByTestId("today")).toHaveText(formatLocalDate(karachi));

  // Pick a zone whose date differs from Karachi right now.
  const other = ["Pacific/Pago_Pago", "Pacific/Kiritimati"].find((tz) => todayIn(tz, now) !== karachi)!;
  await page.goto("/profile");
  await pickTimezone(page, "Time zone", other);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();

  await page.goto("/my-day");
  await expect(page.getByTestId("today")).toHaveText(formatLocalDate(todayIn(other, new Date())));

  await page.goto("/profile");
  await pickTimezone(page, "Time zone", "Asia/Karachi");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
});

test("a deactivated BD can't sign in and an existing session reads nothing", async ({ page, browser }) => {
  // Ahmed has a live session in another browser
  const ctx = await browser.newContext();
  const bd = await ctx.newPage();
  await signIn(bd, "ahmed");

  await signIn(page, "zain");
  await page.goto("/team");
  await page.getByRole("button", { name: `Actions for ${TEAM.ahmed.name}` }).click();
  await page.getByRole("menuitem", { name: "Deactivate" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Ahmed will lose access immediately. Their past work stays in reports.");
  await dialog.getByRole("button", { name: "Deactivate only" }).click();
  await expect(page.getByTestId(`member-${TEAM.ahmed.email}`).getByText("Deactivated")).toBeVisible();

  // The existing session reads no data: the app signs them out
  await bd.goto("/my-day");
  await expect(bd).toHaveURL(/\/login/);
  await expect(bd.getByText("Your access has been turned off. Contact the founder.")).toBeVisible();
  await ctx.close();

  // And they can't sign in again
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEAM.ahmed.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Your access has been turned off. Contact the founder.")).toBeVisible();

  // Reactivate for later tests
  await signIn(page, "zain");
  await page.goto("/team");
  await page.getByRole("button", { name: `Actions for ${TEAM.ahmed.name}` }).click();
  await page.getByRole("menuitem", { name: "Reactivate" }).click();
  await expect(page.getByTestId(`member-${TEAM.ahmed.email}`).getByText("Active")).toBeVisible();
  await signIn(page, "ahmed");
});
