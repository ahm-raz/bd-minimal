import { describe, expect, it } from "vitest";
import { csvCell, decodeCsv, parseCsv, toCsv } from "@/lib/import/csv";
import { headerKey, mapColumns } from "@/lib/import/columns";
import { looksLikeFormula, validateRows, type ImportContext } from "@/lib/import/validate";

describe("CSV parser (RFC 4180)", () => {
  it("reads a BOM, CRLF and LF, and quoted commas, quotes and line breaks", () => {
    const r = parseCsv('﻿Company,Notes\r\n"Acme, Inc.","Said ""call me""\nnext week"\nBeta,plain\n');
    expect(r).toEqual({
      ok: true,
      header: ["Company", "Notes"],
      rows: [
        { line: 2, cells: ["Acme, Inc.", 'Said "call me"\nnext week'] },
        { line: 3, cells: ["Beta", "plain"] },
      ],
    });
  });

  it("gives structured errors instead of throwing", () => {
    expect(parseCsv("")).toEqual({ ok: false, error: "The file is empty." });
    expect(parseCsv("\n\n")).toEqual({ ok: false, error: "The file is empty." });
    expect(parseCsv('a,b\n"open,1\n')).toMatchObject({ ok: false, error: expect.stringContaining("Row 2: a quoted value is never closed") });
    expect(parseCsv('a,b\n"x"y,1\n')).toMatchObject({ ok: false, error: expect.stringContaining("text after a closing quote") });
    expect(parseCsv('a,b\nx"y,1\n')).toMatchObject({ ok: false, error: expect.stringContaining("quote in the middle") });
    expect(parseCsv("a,b\n1,2,3\n")).toMatchObject({ ok: false, error: expect.stringContaining("Row 2 has 3 values") });
  });

  it("allows short rows and empty trailing cells", () => {
    expect(parseCsv("a,b,c\n1\n2,,\n")).toMatchObject({ ok: true, rows: [{ cells: ["1"] }, { cells: ["2", "", ""] }] });
  });

  it("rejects text that isn't UTF-8", () => {
    expect(decodeCsv(new Uint8Array([0x41, 0xff, 0x42]))).toMatchObject({ ok: false });
    expect(decodeCsv(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toEqual({ ok: true, text: "A" });
  });

  it("writes safe CSV: quotes and defused formulas", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(toCsv([["a", 1], [null, "b"]])).toBe("a,1\r\n,b\r\n");
  });
});

describe("header mapping", () => {
  it("ignores case, spaces and punctuation", () => {
    expect(["First Name", "first_name", "firstName", "FIRSTNAME", "first-name"].map(headerKey)).toEqual(
      Array(5).fill("firstname"),
    );
    const m = mapColumns(["Company Name", "firstName", "Last Name", "E-mail Address", "Industry"]);
    expect(m.errors).toEqual([]);
    expect(m.fields).toMatchObject({ company_name: 0, first_name: 1, last_name: 2, contact_email: 3, niche: 4 });
  });

  it("never guesses: 'Name' must be renamed, duplicates and clashes are errors", () => {
    expect(mapColumns(["Name", "Company"]).errors).toEqual(['Rename "Name" to "Company name" or "Contact name".']);
    expect(mapColumns(["Company", "company"]).errors[0]).toContain('Columns 1 and 2 are both "company"');
    expect(mapColumns(["Company", "Business"]).errors[0]).toContain("both map to Company name");
    expect(mapColumns(["Website"]).errors).toEqual(['Add a "Company name" column. Every lead needs one.']);
  });

  it("reads plain Email / Phone as the contact's only when there's a contact name", () => {
    const withContact = mapColumns(["Company", "First name", "Email", "Phone"]);
    expect(withContact.fields).toMatchObject({ contact_email: 2, contact_phone: 3 });
    expect(withContact.columns[2]!.note).toContain("contact's");
    const companyOnly = mapColumns(["Company", "Email", "Phone"]);
    expect(companyOnly.fields).toMatchObject({ company_email: 1, company_phone: 2 });
  });

  it("warns about columns it doesn't import, with the reason", () => {
    const m = mapColumns(["Company", "Status", "Revenue"]);
    expect(m.errors).toEqual([]);
    expect(m.warnings).toEqual([
      'Column "Status" isn\'t imported. Status is set automatically from activity.',
      'Column "Revenue" isn\'t imported. It doesn\'t match a lead field.',
    ]);
  });
});

const ctx: ImportContext = {
  viewer: { id: "zain", role: "founder" },
  niches: [
    { id: "n-dental", name: "Dental", is_active: true },
    { id: "n-old", name: "Retired", is_active: false },
  ],
  channels: [{ id: "c-email", name: "Email", is_active: true }],
  campaigns: [{ id: "camp-1", name: "Spring push", status: "active" }],
  members: [
    { id: "zain", email: "zain@example.com", full_name: "Zain Malik", role: "founder", is_active: true },
    { id: "ahmed", email: "ahmed@example.com", full_name: "Ahmed Khan", role: "bd", is_active: true },
    { id: "hina", email: "hina@example.com", full_name: "Hina Raza", role: "social", is_active: true },
  ],
  defaults: { ownerId: "ahmed", nicheId: "n-dental", channelId: "c-email" },
};

function run(csv: string, c: ImportContext = ctx) {
  const parsed = parseCsv(csv);
  if (!parsed.ok) throw new Error(parsed.error);
  return validateRows(mapColumns(parsed.header), parsed.rows, c);
}

describe("row validation", () => {
  it("fills missing columns from defaults and normalises values", () => {
    const r = run("Company,Website,First name,Last name,Email,Phone,State\nSmile Dental,WWW.Smile.com/,Sarah,Mitchell,SARAH@Smile.com,512 555 0100,TX\n");
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({
      row: 2,
      owner_id: "ahmed",
      niche_id: "n-dental",
      channel_id: "c-email",
      priority: "medium",
      company_name: "Smile Dental",
      website: "https://www.smile.com",
      domain: "smile.com",
      country: "United States",
      lead_timezone: "America/Chicago",
      contact: { first_name: "Sarah", last_name: "Mitchell", email: "sarah@smile.com", phone: "+15125550100" },
    });
    expect(r.missingFields.map((m) => m.field)).toContain("niche");
  });

  it("separates missing, empty, invalid and required", () => {
    const r = run(
      "Company,Email,First name,Niche,Priority,Company size,Country\n" +
        ",a@b.co,Ann,,,,\n" + // row 2: company required
        "Beta,not-an-email,Bob,,,,\n" + // row 3: invalid email
        "Gamma,,,Pets,,,\n" + // row 4: unknown niche (never created)
        "Delta,,,,urgent,,\n" + // row 5: bad priority
        "Epsilon,,,,,5000,\n" + // row 6: bad size
        "Zeta,,,,,,Narnia\n" + // row 7: unknown country
        "Eta,,,Retired,,,\n", // row 8: inactive niche
    );
    expect(r.rows).toEqual([]);
    expect(r.invalidRows).toBe(7);
    expect(r.errors.map((e) => [e.row, e.field])).toEqual([
      [2, "Company name"],
      [3, "Contact email"],
      [4, "Niche"],
      [5, "Priority"],
      [6, "Company size"],
      [7, "Country"],
      [8, "Niche"],
    ]);
  });

  it("needs a contact's first name only when there are contact details", () => {
    const r = run("Company,First name,Contact email\nAlpha,,x@alpha.com\nBeta,,\n");
    expect(r.errors).toEqual([{ row: 2, field: "Contact first name", message: "Add the contact's first name, or remove their details." }]);
    const ok = run("Company\nBeta Co\n");
    expect(ok.rows[0]!.contact).toBeNull();
    expect(ok.warnings).toContainEqual({ row: 2, field: null, message: "No contact. Add one before outreach." });
  });

  it("splits a full name when there's no first-name column", () => {
    expect(run("Company,Contact name\nAcme,Mary Ann Lee\n").rows[0]!.contact).toMatchObject({ first_name: "Mary", last_name: "Ann Lee" });
  });

  it("requires niche and channel when there's no column and no default", () => {
    const r = run("Company\nAcme\n", { ...ctx, defaults: { ownerId: null, nicheId: null, channelId: null } });
    expect(r.errors.map((e) => e.field)).toEqual(["Niche", "Channel"]);
  });

  it("routes rows by Owner email for the founder only", () => {
    const r = run("Company,Owner email\nA1 Co,AHMED@example.com\nB2 Co,\nC3 Co,hina@example.com\n");
    expect(r.errors).toEqual([{ row: 4, field: "Owner email", message: "No active BD or founder has the email hina@example.com." }]);
    const bd = run("Company,Owner email\nA1 Co,zain@example.com\n", { ...ctx, viewer: { id: "ahmed", role: "bd" } });
    expect(bd.rows[0]!.owner_id).toBe("ahmed");
    expect(bd.warnings[0]!.message).toContain("Owner email is ignored");
  });

  it("blocks formulas but keeps +1 phone numbers", () => {
    expect(looksLikeFormula("=SUM(A1)")).toBe(true);
    expect(looksLikeFormula("@cmd")).toBe(true);
    expect(looksLikeFormula("+cmd|' /C calc'!A0")).toBe(true);
    expect(looksLikeFormula("-2+3")).toBe(false);
    const r = run('Company,Phone,Notes\nAcme,+1 512 555 0100,"=HYPERLINK(""x"")"\n');
    expect(r.errors).toEqual([{ row: 2, field: "Notes", message: "Looks like a spreadsheet formula. Remove the leading =, +, - or @." }]);
  });

  it("rejects over-long cells", () => {
    const r = run(`Company,Notes\nAcme,${"x".repeat(5001)}\n`);
    expect(r.errors[0]).toMatchObject({ row: 2, field: "Notes" });
  });

  it("finds duplicates inside the file by the Add lead rule, per owner", () => {
    const r = run(
      "Company,Website,First name,Email,Owner email\n" +
        "Acme,acme.com,Ann,ann@acme.com,\n" +
        "Acme Two,https://acme.com/about,Bo,,\n" + // same website as row 2
        "Other,,Cy,ANN@acme.com,\n" + // same contact email as row 2
        "Acme,,Di,,zain@example.com\n", // same name, different owner: allowed
    );
    expect(r.duplicateRows).toBe(3);
    expect(r.errors.map((e) => e.message)).toEqual(["Duplicate of row 2: same website.", "Duplicate of row 2: same contact email."]);
    expect(r.rows).toEqual([]);
  });

  it("skips blank rows and counts them", () => {
    const r = run("Company\nAcme\n,\n\nBeta\n");
    expect(r.totalRows).toBe(2);
    expect(r.blankRows).toBe(2);
    expect(r.rows.map((x) => x.company_name)).toEqual(["Acme", "Beta"]);
  });
});
