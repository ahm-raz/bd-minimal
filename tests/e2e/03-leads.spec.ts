import type { Page } from "@playwright/test";
import { admin, clientAs, ensureTeam, expect, signIn, test, type Who } from "./helpers";

test.describe.configure({ mode: "serial" });

let ids: Record<Who, string>;
test.beforeAll(async () => {
  ids = await ensureTeam();
});

async function pick(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function openNewLead(page: Page) {
  await page.goto("/leads");
  await page.getByRole("button", { name: /^Lead/ }).click();
  await expect(page.getByRole("dialog", { name: "New lead" })).toBeVisible();
}

test("a lead with only name, niche, channel, first name and LinkedIn saves", async ({ page }) => {
  await signIn(page, "ahmed");
  await openNewLead(page);
  const dialog = page.getByRole("dialog", { name: "New lead" });
  await dialog.getByLabel("Company name").fill("Bright Smile Dental");
  // niche is pre-filled with Ahmed's primary niche (Dental)
  await expect(dialog.getByRole("combobox", { name: "Niche", exact: true })).toContainText("Dental");
  await pick(page, "Channel", "LinkedIn");
  await dialog.getByLabel("First name").first().fill("Maria");
  await dialog.getByLabel("LinkedIn URL", { exact: true }).first().fill("linkedin.com/in/maria-lopez/");
  await dialog.getByRole("button", { name: "Save lead", exact: true }).click();
  await expect(page.getByText("Lead saved")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: "Bright Smile Dental" })).toBeVisible();

  const { data } = await admin().from("contacts").select("linkedin_url, is_primary, leads!inner(company_name)").eq("leads.company_name", "Bright Smile Dental");
  expect(data?.[0]?.linkedin_url).toBe("https://www.linkedin.com/in/maria-lopez");
  expect(data?.[0]?.is_primary).toBe(true);
});

test("a lead without any contact method doesn't save", async ({ page }) => {
  await signIn(page, "ahmed");
  await openNewLead(page);
  const dialog = page.getByRole("dialog", { name: "New lead" });
  await dialog.getByLabel("Company name").fill("No Reach Dental");
  await pick(page, "Channel", "Email");
  await dialog.getByLabel("First name").first().fill("Front desk");
  await dialog.getByRole("button", { name: "Save lead", exact: true }).click();
  await expect(dialog.getByTestId("reach-error")).toHaveText("Add at least one way to reach them: email, phone or LinkedIn.");
  const { count } = await admin().from("leads").select("id", { count: "exact", head: true }).eq("company_name", "No Reach Dental");
  expect(count).toBe(0);
});

test("phone 512 555 0100 is stored as E.164 and displayed nicely; completeness matches the database", async ({ page }) => {
  await signIn(page, "ahmed");
  await openNewLead(page);
  const dialog = page.getByRole("dialog", { name: "New lead" });
  await dialog.getByLabel("Company name").fill("Riverside Family Dental");
  await dialog.getByLabel("Website").fill("riversidefamilydental.com");
  await pick(page, "Channel", "Phone");
  await dialog.getByLabel("First name").first().fill("Raj");
  await dialog.getByLabel("Job title").first().fill("Owner");
  await dialog.getByLabel("Phone", { exact: true }).first().fill("512 555 0100");
  await expect(dialog.getByTestId("completeness-score")).toHaveText("30%");
  // Quick add: the optional details start closed
  await expect(dialog.getByRole("button", { name: /More details/ })).toHaveAttribute("aria-expanded", "false");
  await expect(dialog.getByLabel("City")).toBeHidden();
  // the missing-item list is folded under Completeness; a link opens More details and focuses the field
  await expect(dialog.getByRole("button", { name: "Add a pain point" })).toBeHidden();
  await dialog.getByRole("button", { name: "Completeness", exact: true }).click();
  await dialog.getByRole("button", { name: "Add a pain point" }).click();
  await expect(dialog.getByLabel("Pain point")).toBeFocused();
  await expect(dialog.getByRole("button", { name: /More details/ })).toHaveAttribute("aria-expanded", "true");
  await dialog.getByLabel("Pain point").fill("Missed calls after hours");
  await expect(dialog.getByTestId("completeness-score")).toHaveText("40%");
  await dialog.getByLabel("City").fill("Austin");
  await dialog.getByLabel("State or region").fill("TX");
  await expect(dialog.getByTestId("completeness-score")).toHaveText("50%");
  // lead time zone suggested from the state
  await expect(dialog.getByRole("combobox", { name: "Lead time zone" })).toContainText("America/Chicago");
  await dialog.getByRole("button", { name: "Save lead", exact: true }).click();
  await expect(page.getByText("Lead saved")).toBeVisible();

  const { data: lead } = await admin().from("leads").select("id, completeness, lead_timezone").eq("company_name", "Riverside Family Dental").single();
  expect(lead!.completeness).toBe(50);
  expect(lead!.lead_timezone).toBe("America/Chicago");
  const { data: contact } = await admin().from("contacts").select("phone").eq("lead_id", lead!.id).single();
  expect(contact!.phone).toBe("+15125550100");

  await page.goto(`/leads/${lead!.id}`);
  await expect(page.getByRole("link", { name: "(512) 555-0100" })).toBeVisible();
  await expect(page.getByTestId("lead-local-time")).toContainText("(Austin)");
  await expect(page.getByText("50%").first()).toBeVisible();
});

test("an invalid phone shows the country-specific error inline", async ({ page }) => {
  await signIn(page, "ahmed");
  await openNewLead(page);
  const dialog = page.getByRole("dialog", { name: "New lead" });
  await dialog.getByLabel("Company name").fill("Short Phone Dental");
  await pick(page, "Channel", "Phone");
  await dialog.getByLabel("First name").first().fill("Ann");
  await dialog.getByLabel("Phone", { exact: true }).first().fill("555 0100");
  await dialog.getByRole("button", { name: "Save lead", exact: true }).click();
  await expect(dialog.getByText("This phone number isn't valid for United States. Include the area code.")).toBeVisible();
});

test("the duplicate notice checks only your own leads", async ({ page }) => {
  await signIn(page, "ahmed");
  await openNewLead(page);
  let dialog = page.getByRole("dialog", { name: "New lead" });
  await dialog.getByLabel("Company name").fill("bright smile dental");
  await dialog.getByLabel("Website").click();
  await expect(dialog.getByText("You already have Bright Smile Dental (New).")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Open lead" })).toBeVisible();
  await dialog.getByRole("button", { name: "Add anyway" }).click();
  await expect(dialog.getByText("You already have Bright Smile Dental (New).")).toBeHidden();

  // Sara has no such lead; Ahmed's is never revealed to her
  await signIn(page, "sara");
  await openNewLead(page);
  dialog = page.getByRole("dialog", { name: "New lead" });
  await dialog.getByLabel("Company name").fill("Bright Smile Dental");
  await dialog.getByLabel("Website").fill("riversidefamilydental.com");
  await dialog.getByLabel("First name").first().click();
  await page.waitForTimeout(800);
  await expect(dialog.getByText(/You already have/)).toHaveCount(0);
});

test("a BD never sees another BD's lead through search, filters or URL guessing", async ({ page }) => {
  const { data: lead } = await admin().from("leads").select("id").eq("company_name", "Bright Smile Dental").single();
  await signIn(page, "sara");
  await page.goto("/leads?view=all&q=Bright");
  await expect(page.getByText("No leads match these filters.")).toBeVisible();
  await page.goto("/leads?q=maria");
  await expect(page.getByRole("link", { name: "Bright Smile Dental" })).toHaveCount(0);
  const res = await page.goto(`/leads/${lead!.id}`);
  expect(res?.status()).toBe(404);

  // Direct database access as Sara returns nothing either
  const sara = await clientAs("sara");
  const { data } = await sara.from("leads").select("id").eq("id", lead!.id);
  expect(data).toEqual([]);
});

test("filters live in the URL, combine with AND, and survive a reload", async ({ page }) => {
  await signIn(page, "ahmed");
  await page.goto("/leads");
  await expect(page.getByRole("link", { name: "Bright Smile Dental" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Riverside Family Dental" })).toBeVisible();

  await page.getByRole("button", { name: "Filters" }).click();
  await pick(page, "Completeness", "Under 50%");
  await expect(page).toHaveURL(/comp=lt50/);
  await expect(page.getByRole("link", { name: "Riverside Family Dental" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Bright Smile Dental" })).toBeVisible();

  await pick(page, "Priority", "High");
  await expect(page).toHaveURL(/priority=high/);
  await expect(page.getByText("No leads match these filters.")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page).toHaveURL(/comp=lt50.*priority=high|priority=high.*comp=lt50/);
  await expect(page.getByText("No leads match these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("link", { name: "Riverside Family Dental" })).toBeVisible();

  // search
  await page.getByLabel("Search leads").fill("riverside");
  await expect(page).toHaveURL(/q=riverside/);
  await expect(page.getByRole("link", { name: "Bright Smile Dental" })).toHaveCount(0);
  // phone search by digits
  await page.getByLabel("Search leads").fill("5550100");
  await expect(page.getByRole("link", { name: "Riverside Family Dental" })).toBeVisible();
});

test("column choice is saved and views switch the list", async ({ page }) => {
  await signIn(page, "ahmed");
  await page.goto("/leads");
  await page.getByRole("button", { name: "Columns" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Channel" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: "Channel" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("columnheader", { name: "Channel" })).toBeVisible();

  await page.getByRole("button", { name: "My open leads" }).click();
  await page.getByRole("menuitemradio", { name: "No next action" }).click();
  await expect(page).toHaveURL(/view=no_next/);
  await expect(page.getByRole("link", { name: "Bright Smile Dental" })).toBeVisible();
});

test("BD bulk actions: set status and add a tag", async ({ page }) => {
  await signIn(page, "ahmed");
  await page.goto("/leads");
  await page.getByLabel("Select Bright Smile Dental").click();
  await page.getByRole("button", { name: "Set status" }).click();
  await page.getByRole("menuitem", { name: "Nurture" }).click();
  await expect(page.getByText("1 lead updated")).toBeVisible();
  await page.getByLabel("Select Bright Smile Dental").click();
  await page.getByRole("button", { name: "Add tag" }).click();
  await page.getByLabel("Tag", { exact: true }).fill("Texas");
  await page.getByRole("button", { name: "Add tag" }).last().click();
  await expect(page.getByText("1 lead tagged")).toBeVisible();
  const { data } = await admin().from("leads").select("status, tags").eq("company_name", "Bright Smile Dental").single();
  expect(data).toEqual({ status: "nurture", tags: ["texas"] });
  // BDs don't get Reassign or Delete
  await page.getByLabel("Select Bright Smile Dental").click();
  await expect(page.getByRole("region", { name: "Bulk actions" }).getByRole("button", { name: "Delete" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Bulk actions" }).getByRole("button", { name: "Reassign" })).toHaveCount(0);
});

test("contacts: add, make primary, edit, remove", async ({ page }) => {
  const { data: lead } = await admin().from("leads").select("id").eq("company_name", "Bright Smile Dental").single();
  await signIn(page, "ahmed");
  await page.goto(`/leads/${lead!.id}`);
  await page.getByRole("button", { name: "Add contact" }).click();
  const sheet = page.getByRole("dialog", { name: "Add contact" });
  await sheet.getByLabel("First name").fill("Jenna");
  await sheet.getByLabel("Last name").fill("Ruiz");
  await sheet.getByLabel("Job title").fill("Office manager");
  await sheet.getByLabel("Email", { exact: true }).fill("jenna@brightsmile.com");
  await sheet.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByText("Contact added")).toBeVisible();
  await expect(page.getByTestId("contact-Jenna")).toContainText("Office manager");

  await page.getByRole("button", { name: "Actions for Jenna Ruiz" }).click();
  await page.getByRole("menuitem", { name: "Make primary" }).click();
  await expect(page.getByText("Jenna Ruiz is now the primary contact")).toBeVisible();
  await expect(page.getByTestId("contact-Jenna").getByLabel("Primary contact")).toBeVisible();

  await page.getByRole("button", { name: "Actions for Maria" }).click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await expect(page.getByText("Maria removed")).toBeVisible();
  await expect(page.getByTestId("contact-Maria")).toHaveCount(0);
  // the only contact can't be removed
  await page.getByRole("button", { name: "Actions for Jenna Ruiz" }).click();
  await expect(page.getByRole("menuitem", { name: "Remove" })).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("edit lead: changes save and the panel shows who created it", async ({ page }) => {
  const { data: lead } = await admin().from("leads").select("id").eq("company_name", "Riverside Family Dental").single();
  await signIn(page, "ahmed");
  await page.goto(`/leads/${lead!.id}`);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const sheet = page.getByRole("dialog", { name: "Edit Riverside Family Dental" });
  await expect(sheet).toContainText("Added by Ahmed Khan");
  await sheet.getByLabel("Company LinkedIn URL").fill("linkedin.com/company/riverside-dental");
  await sheet.getByRole("button", { name: "Save lead" }).click();
  await expect(page.getByText("Lead saved")).toBeVisible();
  await expect(page.getByText("60%").first()).toBeVisible();
});

test("founder: reassign from the lead page and delete with the company name typed", async ({ page }) => {
  const { data: lead } = await admin().from("leads").select("id").eq("company_name", "Riverside Family Dental").single();
  await signIn(page, "zain");
  await page.goto(`/leads/${lead!.id}`);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Reassign" }).click();
  await pick(page, "New owner", "Sara Iqbal");
  await page.getByRole("button", { name: "Reassign lead" }).click();
  await expect(page.getByText("Lead reassigned to Sara Iqbal")).toBeVisible();
  await expect(page.getByText("Ahmed Khan to Sara Iqbal", { exact: true })).toBeVisible();
  await expect(page.getByTestId("timeline")).toContainText("Reassigned from Ahmed Khan to Sara Iqbal");

  const { data: after } = await admin().from("leads").select("owner_id, created_by").eq("id", lead!.id).single();
  expect(after!.owner_id).toBe(ids.sara);
  expect(after!.created_by).toBe(ids.ahmed); // credit for "leads added" never moves

  // BDs can't delete (the database refuses)
  const ahmed = await clientAs("ahmed");
  const { data: bright } = await admin().from("leads").select("id").eq("company_name", "Bright Smile Dental").single();
  const del = await ahmed.from("leads").delete().eq("id", bright!.id).select("id");
  expect(del.data ?? []).toEqual([]);

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete Riverside Family Dental?" });
  await expect(dialog.getByRole("button", { name: "Delete lead" })).toBeDisabled();
  await dialog.getByLabel("Company name").fill("Riverside Family Dental");
  await dialog.getByRole("button", { name: "Delete lead" }).click();
  await page.waitForURL(/\/leads$/);
  await expect(page.getByText("Lead deleted")).toBeVisible();
  const { count } = await admin().from("leads").select("id", { count: "exact", head: true }).eq("id", lead!.id);
  expect(count).toBe(0);
});

test("founder: bulk reassign from the list", async ({ page }) => {
  await signIn(page, "zain");
  await page.goto("/leads?view=all");
  await page.getByLabel("Select Bright Smile Dental").click();
  await page.getByRole("region", { name: "Bulk actions" }).getByRole("button", { name: "Reassign" }).click();
  await pick(page, "New owner", "Bilal Aslam");
  await page.getByRole("button", { name: "Reassign leads" }).click();
  await expect(page.getByText("1 lead reassigned")).toBeVisible();
  const { data } = await admin().from("leads").select("owner_id").eq("company_name", "Bright Smile Dental").single();
  expect(data!.owner_id).toBe(ids.bilal);
});
