import { PASSWORD, TEAM, admin, clientAs, ensureOwner, ensureTeam, expect, signIn, signInOwner, test } from "./helpers";

// Many offices in one app (docs/11). The team's office is the first one (Zain is its founder). The platform owner
// is a separate account in no office; it creates a second office on /admin, and the spec checks the wall.
// Runs last: after it, the database has two offices.
test.describe.configure({ mode: "serial" });

const RUN = Date.now();
const OFFICE = `Northwind Legal ${RUN}`;
const NORA = { name: "Nora Hayes", email: `nora${RUN}@northwind.example.com` };
const OMAR = { name: "Omar Reid", email: `omar${RUN}@northwind.example.com` };
const TEAM_COMPANY = `Wall Dental ${RUN}`;
let teamLeadId = "";

test.beforeAll(async () => {
  const ids = await ensureTeam();
  await ensureOwner();
  const ahmed = await clientAs("ahmed");
  const { data: niche } = await ahmed.from("niches").select("id").eq("name", "Dental").single();
  const { data: channel } = await ahmed.from("channels").select("id").eq("name", "LinkedIn").single();
  const { data, error } = await ahmed
    .from("leads")
    .insert({ owner_id: ids.ahmed, company_name: TEAM_COMPANY, niche_id: niche!.id, channel_id: channel!.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  teamLeadId = data.id;
});

test("the platform owner lands on Offices and creates an office with its founder", async ({ page }) => {
  await signInOwner(page);
  await expect(page.getByRole("heading", { name: "Offices" })).toBeVisible();
  // The owner has no office: no sales pages, and the app's pages send them back to Offices.
  await expect(page.getByTestId("owner-email")).toHaveText("owner@example.com");
  await page.goto("/leads");
  await page.waitForURL(/\/admin/);

  await page.getByRole("button", { name: "Create office" }).click();
  const sheet = page.getByRole("dialog", { name: "Create office" });
  await sheet.getByLabel("Office name").fill(OFFICE);
  await sheet.getByLabel("Seats").fill("2");
  await sheet.getByLabel("Full name").fill(NORA.name);
  await sheet.getByLabel("Email").fill(TEAM.ahmed.email);
  await sheet.getByRole("textbox", { name: "Password", exact: true }).fill(PASSWORD);
  await sheet.getByLabel("Confirm password").fill(PASSWORD);
  await sheet.getByRole("button", { name: "Create office" }).click();
  // An email that already has an account, in any office, is refused without naming the office.
  await expect(sheet.getByText("This email already has an account. Use a different email.").first()).toBeVisible();

  await sheet.getByLabel("Email").fill(NORA.email);
  await sheet.getByRole("button", { name: "Create office" }).click();
  await expect(sheet).toBeHidden();
  const row = page.getByTestId(`office-${OFFICE}`);
  await expect(row).toContainText(NORA.email);
  await expect(row).toContainText("1 / 2");
  await expect(row.getByText("Active")).toBeVisible();
});

test("the new founder sees only their own office", async ({ page }) => {
  await signIn(page, { email: NORA.email, password: PASSWORD });
  await expect(page.getByTestId("office-name")).toHaveText(OFFICE);
  // Not a platform admin: no Offices link, and /admin doesn't exist for them.
  await expect(page.getByRole("link", { name: /Offices/ })).toHaveCount(0);
  expect((await page.goto("/admin"))?.status()).toBe(404);

  // Another office's lead is simply not found, and its people and companies appear nowhere.
  expect((await page.goto(`/leads/${teamLeadId}`))?.status()).toBe(404);
  await page.goto("/leads");
  await expect(page.getByText(TEAM_COMPANY)).toHaveCount(0);
  await page.goto("/team");
  await expect(page.locator('[data-testid^="member-"]')).toHaveCount(1);
  await expect(page.getByText(TEAM.ahmed.email)).toHaveCount(0);
  await page.goto("/performance");
  await expect(page.getByText(TEAM.ahmed.name)).toHaveCount(0);
  await page.goto("/feed");
  await expect(page.getByText(TEAM_COMPANY)).toHaveCount(0);
});

test("seats: the founder adds members up to the office's limit, then sees the limit inline", async ({ page }) => {
  await signIn(page, { email: NORA.email, password: PASSWORD });
  await page.goto("/team");
  const add = async (name: string, email: string) => {
    await page.getByRole("button", { name: "Add member" }).click();
    const sheet = page.getByRole("dialog", { name: "Add member" });
    await sheet.getByLabel("Full name").fill(name);
    await sheet.getByRole("textbox", { name: "Email", exact: true }).fill(email);
    await sheet.getByLabel("Primary niche").click();
    await page.getByRole("option", { name: "Law" }).click();
    await sheet.getByRole("textbox", { name: "Password", exact: true }).fill(PASSWORD);
    await sheet.getByLabel("Confirm password").fill(PASSWORD);
    await sheet.getByRole("button", { name: "Add member" }).click();
    return sheet;
  };
  const first = await add(OMAR.name, OMAR.email);
  await expect(first).toBeHidden();
  await expect(page.getByTestId(`member-${OMAR.email}`)).toBeVisible();

  const second = await add("Priya Shah", `priya${RUN}@northwind.example.com`);
  await expect(second.getByRole("alert")).toHaveText("Your office is using all 2 seats. Deactivate someone or contact us for more seats.");
  // Nothing was left behind: no account for Priya.
  const { data } = await admin().from("profiles").select("id").eq("email", `priya${RUN}@northwind.example.com`);
  expect(data).toHaveLength(0);
});

test("the founder renames their office in Settings", async ({ page }) => {
  await signIn(page, { email: NORA.email, password: PASSWORD });
  await page.goto("/settings/office");
  await expect(page.getByTestId("office-seats")).toHaveValue("2 of 2 seats used");
  const nameInput = page.getByLabel("Office name");
  const rename = async (value: string) => {
    // Typing before the form is interactive can be lost; retry until the field holds exactly the new name.
    await expect(async () => {
      await nameInput.fill(value);
      await expect(nameInput).toHaveValue(value, { timeout: 1000 });
      await expect(page.getByRole("button", { name: "Save" })).toBeEnabled({ timeout: 1000 });
    }).toPass();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("office-name")).toHaveText(value);
  };
  await rename(`${OFFICE} LLP`);
  await rename(OFFICE);
});

test("founders and BDs can't open /admin", async ({ page }) => {
  for (const who of ["zain", "ahmed"] as const) {
    await signIn(page, who);
    await expect(page.getByRole("link", { name: /Offices/ })).toHaveCount(0);
    expect((await page.goto("/admin"))?.status()).toBe(404);
  }
});

test("suspending an office stops its members until it's reactivated", async ({ page, browser }) => {
  const ctx = await browser.newContext();
  const omar = await ctx.newPage();
  await signIn(omar, { email: OMAR.email, password: PASSWORD });

  await signInOwner(page);
  const row = page.getByTestId(`office-${OFFICE}`);
  await row.getByRole("button", { name: `Actions for ${OFFICE}` }).click();
  await page.getByRole("menuitem", { name: "Suspend" }).click();
  await page.getByRole("button", { name: "Suspend office" }).click();
  await expect(row.getByText("Suspended")).toBeVisible();

  // Omar's open session loses access on the next page load; signing in again is refused with the reason.
  await omar.goto("/my-day");
  await omar.waitForURL(/\/login/);
  await expect(omar.getByText("Your office's access is paused. Contact us to turn it back on.")).toBeVisible();
  await omar.getByLabel("Email").fill(OMAR.email);
  await omar.getByLabel("Password").fill(PASSWORD);
  await omar.getByRole("button", { name: "Sign in" }).click();
  await expect(omar.getByText("Your office's access is paused. Contact us to turn it back on.")).toBeVisible();

  await row.getByRole("button", { name: `Actions for ${OFFICE}` }).click();
  await page.getByRole("menuitem", { name: "Reactivate" }).click();
  await expect(row.getByText("Active")).toBeVisible();
  await signIn(omar, { email: OMAR.email, password: PASSWORD });
  await expect(omar.getByTestId("office-name")).toHaveText(OFFICE);
  await ctx.close();
});
