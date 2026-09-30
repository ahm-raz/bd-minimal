import type { Page } from "@playwright/test";
import { formatLocalDate, todayIn } from "../../src/lib/dates";
import { PASSWORD, TEAM, admin, clearInbox, expect, latestEmailLink, reserveMember, signIn, test } from "./helpers";

test.describe.configure({ mode: "serial" });

async function pickTimezone(page: Page, label: string, tz: string) {
  await page.getByLabel(label).click();
  await page.getByPlaceholder("Search time zones").fill(tz);
  await page.getByRole("option", { name: tz.replace(/_/g, " ") }).first().click();
}

test("the first office and its founder are created via /setup, and /setup then returns 404", async ({ page }) => {
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Create your office" })).toBeVisible();
  await page.getByLabel("Office name").fill("Test Agency");
  await page.getByLabel("Your name").fill(TEAM.zain.name);
  await page.getByLabel("Email").fill(TEAM.zain.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create office" }).click();
  await page.waitForURL(/\/my-day/);
  await expect(page.getByRole("heading", { name: "My Day" })).toBeVisible();
  // The office name heads the sidebar. The founder isn't the platform owner: no Offices, and /admin is 404.
  await expect(page.getByTestId("office-name")).toHaveText("Test Agency");
  await expect(page.getByRole("link", { name: /Offices/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Team/ })).toBeVisible();

  expect((await page.goto("/admin"))?.status()).toBe(404);
  const res = await page.goto("/setup");
  expect(res?.status()).toBe(404);
  await page.context().clearCookies();
  const res2 = await page.goto("/setup");
  expect(res2?.status()).toBe(404);
});

test("the founder adds a BD with a password (invite email is off) and the BD signs in to My Day", async ({ page, browser }) => {
  await signIn(page, "zain");
  await page.goto("/team");
  await page.getByRole("button", { name: "Add member" }).click();
  const sheet = page.getByRole("dialog", { name: "Add member" });

  // No email domain yet: the invite-email option and its button are disabled
  await expect(sheet.getByRole("radio", { name: /Send an invite email/ })).toBeDisabled();
  await expect(sheet.getByText("Off until an email domain is set up.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Send invite" })).toBeDisabled();
  await expect(sheet.getByRole("radio", { name: /Set a password now/ })).toBeChecked();

  await sheet.getByLabel("Full name").fill(TEAM.ahmed.name);
  await sheet.getByRole("textbox", { name: "Email", exact: true }).fill(TEAM.ahmed.email);
  await sheet.getByLabel("Primary niche").click();
  await page.getByRole("option", { name: "Dental" }).click();
  await sheet.getByRole("textbox", { name: "Password", exact: true }).fill("short");
  await sheet.getByLabel("Confirm password").fill("short");
  await sheet.getByRole("button", { name: "Add member" }).click();
  await expect(sheet.getByText("Use at least 10 characters.")).toBeVisible();
  await sheet.getByRole("textbox", { name: "Password", exact: true }).fill(PASSWORD);
  await sheet.getByLabel("Confirm password").fill(`${PASSWORD}x`);
  await sheet.getByRole("button", { name: "Add member" }).click();
  await expect(sheet.getByText("The passwords don't match.")).toBeVisible();
  await sheet.getByLabel("Confirm password").fill(PASSWORD);
  await sheet.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByText(`${TEAM.ahmed.email} added. They can sign in now.`)).toBeVisible();

  const row = page.getByTestId(`member-${TEAM.ahmed.email}`);
  await expect(row.getByText("Not signed in yet")).toBeVisible();
  await expect(row.getByText("Dental")).toBeVisible();
  // Resending an invite needs email too
  await page.getByRole("button", { name: `Actions for ${TEAM.ahmed.name}` }).click();
  await expect(page.getByRole("menuitem", { name: "Resend invite (email off)" })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");

  const ctx = await browser.newContext();
  const bd = await ctx.newPage();
  await signIn(bd, "ahmed");
  await expect(bd.getByRole("heading", { name: "My Day" })).toBeVisible();
  // BDs don't see founder-only navigation
  await expect(bd.getByRole("link", { name: /Team/ })).toHaveCount(0);
  await ctx.close();

  await page.reload();
  await expect(page.getByTestId(`member-${TEAM.ahmed.email}`).getByText("Active")).toBeVisible();
});

test("an invite link (sent while email is on) still lets the person set a password", async ({ page, baseURL }) => {
  // Invite emails are off in the UI, so start one through the Auth admin API; the link and page stay supported.
  const email = `invitee${Date.now()}@example.com`;
  await clearInbox();
  await reserveMember(email);
  const { error } = await admin().auth.admin.inviteUserByEmail(email, {
    data: { full_name: "Nadia Invitee" },
    redirectTo: `${baseURL}/accept-invite`,
  });
  expect(error).toBeNull();

  const link = await latestEmailLink(email, /href="([^"]*\/auth\/confirm[^"]*)"/);
  await page.goto(link);
  await expect(page).toHaveURL(/\/accept-invite/);
  await expect(page.getByRole("heading", { name: "Welcome, Nadia." })).toBeVisible();
  await expect(page.getByText("Set a password to start.")).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByLabel("Confirm password").fill("short");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByText("Use at least 10 characters.")).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Set password" }).click();
  await page.waitForURL(/\/my-day/);
  await expect(page.getByRole("heading", { name: "My Day" })).toBeVisible();
});

test("the founder sets a new password for a member; the old one stops working", async ({ page, browser }) => {
  const NEW = "brand-new-pass-456";
  const setPassword = async (password: string) => {
    await page.goto("/team");
    await page.getByRole("button", { name: `Actions for ${TEAM.ahmed.name}` }).click();
    await page.getByRole("menuitem", { name: "Set password" }).click();
    const dialog = page.getByRole("dialog", { name: "Set a new password for Ahmed" });
    await dialog.getByLabel("New password").fill(password);
    await dialog.getByLabel("Confirm password").fill(password);
    await dialog.getByRole("button", { name: "Set password" }).click();
    await expect(page.getByText("New password set for Ahmed")).toBeVisible();
  };

  await signIn(page, "zain");
  // The founder's own row has no Set password (they use Profile)
  await page.goto("/team");
  await page.getByRole("button", { name: `Actions for ${TEAM.zain.name}` }).click();
  await expect(page.getByRole("menuitem", { name: "Set password" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await setPassword(NEW);
  const ctx = await browser.newContext();
  const bd = await ctx.newPage();
  await bd.goto("/login");
  await bd.getByLabel("Email").fill(TEAM.ahmed.email);
  await bd.getByLabel("Password").fill(PASSWORD);
  await bd.getByRole("button", { name: "Sign in" }).click();
  await expect(bd.getByText("Email or password is incorrect.")).toBeVisible();
  await signIn(bd, { email: TEAM.ahmed.email, password: NEW });
  await expect(bd.getByRole("heading", { name: "My Day" })).toBeVisible();
  await ctx.close();

  // Back to the shared test password for the later tests
  await setPassword(PASSWORD);
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
