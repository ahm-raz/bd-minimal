import { PASSWORD, admin, clearInbox, clientAs, ensureTeam, expect, latestEmailLink, reserveMember, signIn, test, type Who } from "./helpers";

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
    .insert({ owner_id: ids[who], company_name: company, niche_id: niche!.id, channel_id: channel!.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await c.from("contacts").insert({ lead_id: data.id, first_name: "Iris", last_name: `Menu${RUN}`, is_primary: true, email: `iris${RUN}@x.com` });
  return data.id;
}

test("Ctrl+K searches leads and contacts, and runs actions", async ({ page }) => {
  const company = `Command Dental ${RUN}`;
  const leadId = await addLead("ahmed", company);
  await signIn(page, "ahmed");
  await page.goto("/my-day");
  const dialog = page.getByRole("dialog", { name: "Command menu" });
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await page.keyboard.type(`Command Dental ${RUN}`);
  await expect(dialog.getByRole("option", { name: new RegExp(company) })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.waitForURL(new RegExp(`/leads/${leadId}`));

  // contacts are searchable too
  await page.keyboard.press("Control+k");
  await page.keyboard.type(`Menu${RUN}`);
  await expect(dialog.getByRole("group", { name: "Contacts" }).getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Escape");

  // Log activity asks for the lead first
  await page.keyboard.press("Control+k");
  await dialog.getByRole("option", { name: /Log activity/ }).click();
  await page.keyboard.type(company);
  await dialog.getByRole("option", { name: new RegExp(company) }).click();
  await expect(page.getByRole("dialog", { name: "Log activity" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Log activity" })).toContainText(company);
  await page.keyboard.press("Escape");

  // Sara can't find Ahmed's lead
  await signIn(page, "sara");
  await page.keyboard.press("Control+k");
  await page.keyboard.type(company);
  await expect(dialog.getByText("No matches. Try a company, contact name or email.")).toBeVisible();
});

test("unknown pages show the 404 page", async ({ page }) => {
  await signIn(page, "ahmed");
  const res = await page.goto("/leads/00000000-0000-4000-8000-000000000000");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Leads" })).toBeVisible();
});

test("a new BD goes from invite email to a first logged activity, keyboard only", async ({ browser, baseURL }) => {
  const email = `newbd${RUN}@example.com`;
  await clearInbox();
  await reserveMember(email);
  // Invite emails are off in the Team UI until a sending domain exists; the link flow itself stays supported.
  const { data: invited, error } = await admin().auth.admin.inviteUserByEmail(email, {
    data: { full_name: "Omar Farooq" },
    redirectTo: `${baseURL}/accept-invite`,
  });
  expect(error).toBeNull();
  const { data: dental } = await admin().from("niches").select("id").eq("name", "Dental").single();
  await admin().from("profiles").update({ primary_niche_id: dental!.id }).eq("id", invited.user!.id);

  const link = await latestEmailLink(email, /href="([^"]*\/auth\/confirm[^"]*)"/);
  const ctx = await browser.newContext();
  const bd = await ctx.newPage();
  await bd.goto(link);
  await expect(bd.getByRole("heading", { name: "Welcome, Omar." })).toBeVisible();
  await bd.keyboard.press("Tab");
  await bd.keyboard.type(PASSWORD);
  await bd.keyboard.press("Tab");
  await bd.keyboard.type(PASSWORD);
  await bd.keyboard.press("Enter");
  await bd.waitForURL(/\/my-day/);

  // N: add a lead with the keyboard
  const newLead = bd.getByRole("dialog", { name: "New lead" });
  await expect(async () => {
    await bd.keyboard.press("n");
    await expect(newLead).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(newLead.getByLabel("Company name")).toBeFocused();
  await bd.keyboard.type(`First Lead Dental ${RUN}`);
  await newLead.getByRole("combobox", { name: "Channel", exact: true }).focus();
  await bd.keyboard.press("Enter");
  await bd.keyboard.press("ArrowDown");
  await bd.keyboard.press("Enter");
  await newLead.getByLabel("First name").first().focus();
  await bd.keyboard.type("Nina");
  await newLead.getByLabel("Email", { exact: true }).first().focus();
  await bd.keyboard.type("nina@firstlead.com");
  await newLead.getByRole("button", { name: "Save lead", exact: true }).focus();
  await bd.keyboard.press("Enter");
  await expect(bd.getByText("Lead saved")).toBeVisible();

  // Open it and log the first activity with L
  const { data: lead } = await admin().from("leads").select("id").eq("company_name", `First Lead Dental ${RUN}`).single();
  await bd.goto(`/leads/${lead!.id}`);
  const log = bd.getByRole("dialog", { name: "Log activity" });
  await expect(async () => {
    await bd.keyboard.press("l");
    await expect(log).toBeVisible({ timeout: 1000 });
  }).toPass();
  await log.getByLabel("No next step").focus();
  await bd.keyboard.press("Space");
  await log.getByRole("button", { name: "Log activity" }).focus();
  await bd.keyboard.press("Enter");
  await expect(bd.getByText("Activity logged")).toBeVisible();
  const { data: acts } = await admin().from("activities").select("id").eq("lead_id", lead!.id);
  expect(acts).toHaveLength(1);
  await ctx.close();
});
