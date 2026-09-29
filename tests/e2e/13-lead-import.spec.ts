import { admin, ensureTeam, expect, signIn, test } from "./helpers";

/** M12 (docs/04 section 10): CSV lead import, all rows or none, founder-granted for BDs. */
test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString().slice(-6);
let ids: Awaited<ReturnType<typeof ensureTeam>>;
test.beforeAll(async () => {
  ids = await ensureTeam();
  await admin().from("profiles").update({ can_import_leads: false }).in("id", [ids.ahmed, ids.sara]);
});

const csv = (rows: string[]) =>
  ["Company name,Website,First name,Last name,Email,Phone,State,Niche", ...rows].join("\r\n") + "\r\n";

async function leadCount() {
  const { count } = await admin().from("leads").select("id", { count: "exact", head: true }).ilike("company_name", `%${RUN}%`);
  return count ?? 0;
}

test("a BD needs the founder's permission, enforced by the API too", async ({ page }) => {
  await signIn(page, "ahmed");
  await page.goto("/leads");
  await expect(page.getByRole("link", { name: "Import CSV" })).toHaveCount(0);
  await page.goto("/leads/import");
  await page.waitForURL(/\/leads(\?|$)/);
  await expect(page.getByText("Importing leads needs the founder's permission.")).toBeVisible();
  // Straight to the endpoint: refused.
  const status = await page.evaluate(async () => {
    const form = new FormData();
    form.set("file", new File(["Company name\nAcme\n"], "x.csv", { type: "text/csv" }));
    return (await fetch("/api/leads/import/preview", { method: "POST", body: form })).status;
  });
  expect(status).toBe(403);

  // The founder turns it on for Ahmed.
  await signIn(page, "zain");
  await page.goto("/leads/import");
  await page.getByRole("switch", { name: "Ahmed Khan can import leads" }).click();
  await expect(page.getByText("Import turned on")).toBeVisible();
  await expect.poll(async () => (await admin().from("profiles").select("can_import_leads").eq("id", ids.ahmed).single()).data?.can_import_leads).toBe(true);
});

test("a file with one bad row adds nothing; the fixed file imports every row, marked as imported", async ({ page }) => {
  await signIn(page, "ahmed");
  await page.goto("/leads");
  await page.getByRole("link", { name: "Import CSV" }).click();
  await expect(page.getByRole("heading", { name: "Import leads" })).toBeVisible();

  const bad = csv([
    `Alpha Dental ${RUN},alpha${RUN}.com,Ann,Lee,ann@alpha${RUN}.com,512 555 0100,TX,Dental`,
    `Beta Dental ${RUN},beta${RUN}.com,Bob,,not-an-email,,CA,Dental`,
    `Gamma Dental ${RUN},,Cy,,cy@gamma${RUN}.com,,NY,Pets`,
  ]);
  await page.locator("#csv-file").setInputFiles({ name: "prospects.csv", mimeType: "text/csv", buffer: Buffer.from(bad) });
  await page.getByRole("button", { name: "Check file" }).click();
  const preview = page.getByTestId("import-preview");
  await expect(preview.getByTestId("import-failed")).toContainText("Import failed. No leads were added.");
  const errors = preview.getByTestId("import-errors");
  await expect(errors).toContainText("Contact email");
  await expect(errors).toContainText('Unknown niche "Pets"');
  await expect(preview.getByRole("button", { name: /^Import \d/ })).toBeDisabled();
  expect(await leadCount()).toBe(0);

  const good = csv([
    `Alpha Dental ${RUN},alpha${RUN}.com,Ann,Lee,ann@alpha${RUN}.com,512 555 0100,TX,Dental`,
    `Beta Dental ${RUN},beta${RUN}.com,Bob,,bob@beta${RUN}.com,,CA,Dental`,
    `Gamma Dental ${RUN},,Cy,,cy@gamma${RUN}.com,,NY,`,
  ]);
  await page.getByRole("button", { name: "Start over" }).click();
  await page.locator("#csv-file").setInputFiles({ name: "prospects.csv", mimeType: "text/csv", buffer: Buffer.from(good) });
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.getByText("Every row passed.")).toBeVisible();
  await page.getByRole("button", { name: "Import 3 leads" }).click();
  await expect(page.getByTestId("import-done")).toContainText("3 leads imported");
  expect(await leadCount()).toBe(3);

  const { data: leads } = await admin()
    .from("leads")
    .select("owner_id, created_by, import_batch_id, source_id, lead_sources(name), contacts(email, is_primary)")
    .ilike("company_name", `%${RUN}%`);
  for (const l of leads!) {
    expect(l.owner_id).toBe(ids.ahmed);
    expect(l.import_batch_id).not.toBeNull();
    expect((l.lead_sources as unknown as { name: string }).name).toBe("CSV import");
    expect(l.contacts).toHaveLength(1);
  }
  // No per-lead feed lines; one import line.
  const batch = leads![0]!.import_batch_id!;
  const { data: feed } = await admin().from("feed_events").select("kind, summary").eq("actor_id", ids.ahmed).eq("kind", "leads_imported");
  expect(feed!.some((f) => f.summary.includes("imported 3 leads from prospects.csv"))).toBe(true);

  // "View these leads" filters to the batch.
  await page.getByRole("link", { name: "View these leads" }).click();
  await expect(page).toHaveURL(new RegExp(`batch=${batch}`));
  await expect(page.getByTestId("batch-filter")).toBeVisible();
  await expect(page.getByRole("link", { name: `Alpha Dental ${RUN}` })).toBeVisible();

  // The same file again is refused as duplicates, and still adds nothing.
  await page.goto("/leads/import");
  await page.locator("#csv-file").setInputFiles({ name: "prospects.csv", mimeType: "text/csv", buffer: Buffer.from(good) });
  await page.getByRole("button", { name: "Check file" }).click();
  await expect(page.getByTestId("import-errors")).toContainText("Already in your leads");
  expect(await leadCount()).toBe(3);
  await expect(page.getByTestId("import-history")).toContainText("Imported");
});

test("revoking stops the next import at once; the sidebar has Notifications", async ({ page }) => {
  await signIn(page, "zain");
  await expect(page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: /Notifications/ })).toBeVisible();
  await admin().from("profiles").update({ can_import_leads: false }).eq("id", ids.ahmed);
  await signIn(page, "ahmed");
  await page.goto("/leads");
  await expect(page.getByRole("link", { name: "Import CSV" })).toHaveCount(0);
});
