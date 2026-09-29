/**
 * CSV lead import: turn parsed rows into validated, normalised leads (docs/04, CSV import).
 * Pure: no database. The server stores the result and the import RPC writes it in one transaction.
 *
 * Missing column → empty or the screen default (silent). Empty cell → the same.
 * Invalid value → row error naming the field. Missing required value → row error.
 * Any error blocks the whole file: nothing is imported until every row is valid.
 */
import { COMPANY_SIZES, PRIORITIES, type LeadPriority } from "@/lib/domain";
import {
  COUNTRIES,
  countryCode,
  countryName,
  domainOf,
  normalizeCompanyLinkedIn,
  normalizeContactLinkedIn,
  normalizeEmail,
  normalizePhone,
  normalizeTags,
  normalizeWebsite,
  suggestTimezone,
  type Normalized,
} from "@/lib/validation/normalize";
import { isBlank } from "./csv";
import { IMPORT_FIELDS, type ImportField, type MappingResult } from "./columns";

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_CELL_LENGTH = 5000;
/** Only the first errors are kept and shown; the counts cover every row. */
export const MAX_REPORTED_ERRORS = 200;

export type ImportIssue = { row: number | null; field: string | null; message: string };

export type ImportContact = {
  first_name: string;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  linkedin_url: string | null;
};

/** A validated lead, keyed by database column, ready for import_lead_batch(). */
export type ImportRow = {
  row: number;
  owner_id: string;
  niche_id: string;
  channel_id: string;
  campaign_id: string | null;
  priority: LeadPriority;
  company_name: string;
  website: string | null;
  domain: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_linkedin_url: string | null;
  address: string | null;
  city: string | null;
  state_region: string | null;
  country: string;
  lead_timezone: string | null;
  sub_niche: string | null;
  company_size: string | null;
  notes: string | null;
  pain_point: string | null;
  offer: string | null;
  tags: string[];
  contact: ImportContact | null;
};

type Named = { id: string; name: string; is_active?: boolean };
export type ImportContext = {
  viewer: { id: string; role: "founder" | "bd" | "social" };
  niches: Named[];
  channels: Named[];
  campaigns: { id: string; name: string; status: string }[];
  members: { id: string; email: string; full_name: string | null; role: string; is_active: boolean }[];
  defaults: { ownerId: string | null; nicheId: string | null; channelId: string | null };
};

export type ValidationResult = {
  rows: ImportRow[];
  errors: ImportIssue[];
  errorCount: number;
  warnings: ImportIssue[];
  totalRows: number;
  blankRows: number;
  invalidRows: number;
  duplicateRows: number;
  /** Lead fields with no column in the file, and what they get instead. */
  missingFields: { field: string; label: string; outcome: string }[];
};

const LIMITS: Partial<Record<ImportField, number>> = {
  website: 300,
  company_phone: 40,
  company_email: 200,
  company_linkedin_url: 300,
  address: 300,
  city: 100,
  state_region: 100,
  country: 100,
  sub_niche: 100,
  notes: 5000,
  pain_point: 1000,
  offer: 1000,
  first_name: 60,
  last_name: 60,
  full_name: 121,
  job_title: 100,
  contact_email: 200,
  contact_phone: 40,
  mobile_phone: 40,
  contact_linkedin_url: 300,
};

/** A cell a spreadsheet would run as a formula. "+1 512…" phone numbers and "-" notes are fine. */
export function looksLikeFormula(v: string): boolean {
  return /^[=@\t\r]/.test(v) || /^[+-]\s*[A-Za-z(]/.test(v);
}

const US_WORDS = new Set(["us", "usa", "u.s.", "u.s.a.", "united states", "united states of america", "america"]);

function lookup(list: Named[], raw: string): Named | undefined {
  const k = raw.trim().toLowerCase();
  return list.find((x) => x.name.trim().toLowerCase() === k);
}

export function validateRows(
  mapping: MappingResult,
  records: { line: number; cells: string[] }[],
  ctx: ImportContext,
): ValidationResult {
  const f = mapping.fields;
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  let errorCount = 0;
  const badRows = new Set<number>();
  const push = (row: number, field: ImportField | null, message: string) => {
    errorCount++;
    badRows.add(row);
    if (errors.length < MAX_REPORTED_ERRORS) {
      errors.push({ row, field: field ? IMPORT_FIELDS[field].label : null, message });
    }
  };

  const founder = ctx.viewer.role === "founder";
  const activeNiches = ctx.niches.filter((n) => n.is_active !== false);
  const activeChannels = ctx.channels.filter((c) => c.is_active !== false);
  const owners = ctx.members.filter((m) => m.is_active && (m.role === "bd" || m.role === "founder"));
  const defaultOwner = founder ? (ctx.defaults.ownerId ?? ctx.viewer.id) : ctx.viewer.id;
  const defaultNiche = activeNiches.find((n) => n.id === ctx.defaults.nicheId) ?? null;
  const defaultChannel = activeChannels.find((c) => c.id === ctx.defaults.channelId) ?? null;

  if (!founder && f.owner_email !== undefined) {
    warnings.push({ row: null, field: "Owner email", message: "Owner email is ignored: leads you import are yours." });
  }

  const rows: ImportRow[] = [];
  let blankRows = 0;
  const nonBlank = records.filter((r) => {
    if (isBlank(r.cells)) {
      blankRows++;
      return false;
    }
    return true;
  });

  for (const { line, cells } of nonBlank) {
    const cell = (field: ImportField): string | null => {
      const i = f[field];
      if (i === undefined) return null;
      const v = (cells[i] ?? "").trim();
      return v === "" ? null : v;
    };
    let rowOk = true;
    const fail = (field: ImportField | null, message: string) => {
      rowOk = false;
      push(line, field, message);
    };

    // Cell-level safety first: formulas and runaway lengths, for every mapped field.
    for (const field of Object.keys(f) as ImportField[]) {
      const v = cell(field);
      if (v === null) continue;
      if (v.length > MAX_CELL_LENGTH) fail(field, `Keep it under ${MAX_CELL_LENGTH} characters.`);
      else if (LIMITS[field] && v.length > LIMITS[field]!) fail(field, `Keep it under ${LIMITS[field]} characters.`);
      else if (looksLikeFormula(v) && !(field.endsWith("phone") && /^\+[\d\s().-]+$/.test(v))) {
        fail(field, "Looks like a spreadsheet formula. Remove the leading =, +, - or @.");
      }
    }
    if (!rowOk) continue;

    const norm = (field: ImportField, fn: (v: string | null) => Normalized): string | null => {
      const r = fn(cell(field));
      if (!r.ok) {
        fail(field, r.error);
        return null;
      }
      return r.value;
    };

    // Company
    const company = cell("company_name");
    if (!company) fail("company_name", "Company name is missing.");
    else if (company.length < 2) fail("company_name", "Use at least 2 characters for the company name.");
    else if (company.length > 120) fail("company_name", "Keep the company name under 120 characters.");

    // Country first: phones are read in the lead's country.
    let country = "United States";
    const countryRaw = cell("country");
    if (countryRaw) {
      const code = countryCode(countryRaw);
      const known = code !== "US" || US_WORDS.has(countryRaw.toLowerCase()) || countryRaw.toUpperCase() === "US";
      const byCode = COUNTRIES.find((c) => c.code === countryRaw.toUpperCase());
      if (known) country = countryName(code);
      else if (byCode) country = byCode.name;
      else fail("country", `"${countryRaw}" isn't a country we know. Use its English name, e.g. United States.`);
    }

    const website = norm("website", normalizeWebsite);
    const company_email = norm("company_email", normalizeEmail);
    const company_linkedin_url = norm("company_linkedin_url", normalizeCompanyLinkedIn);
    const company_phone = norm("company_phone", (v) => normalizePhone(v, country));

    // Lookups: never created, only matched.
    let niche_id = defaultNiche?.id ?? null;
    const nicheRaw = cell("niche");
    if (nicheRaw) {
      const n = lookup(activeNiches, nicheRaw);
      if (n) niche_id = n.id;
      else fail("niche", `Unknown niche "${nicheRaw}". Use one of: ${activeNiches.map((x) => x.name).join(", ")}.`);
    } else if (!niche_id) fail("niche", "Niche is missing. Add a Niche column or pick a default niche.");

    let channel_id = defaultChannel?.id ?? null;
    const channelRaw = cell("channel");
    if (channelRaw) {
      const c = lookup(activeChannels, channelRaw);
      if (c) channel_id = c.id;
      else fail("channel", `Unknown channel "${channelRaw}". Use one of: ${activeChannels.map((x) => x.name).join(", ")}.`);
    } else if (!channel_id) fail("channel", "Channel is missing. Add a Channel column or pick a default channel.");

    let campaign_id: string | null = null;
    const campaignRaw = cell("campaign");
    if (campaignRaw) {
      const c = lookup(ctx.campaigns, campaignRaw);
      if (c) campaign_id = c.id;
      else fail("campaign", `Unknown campaign "${campaignRaw}". Create it in Settings first, or leave the cell empty.`);
    }

    let priority: LeadPriority = "medium";
    const priorityRaw = cell("priority");
    if (priorityRaw) {
      const p = priorityRaw.toLowerCase() as LeadPriority;
      if (PRIORITIES.includes(p)) priority = p;
      else fail("priority", "Use High, Medium or Low.");
    }

    let company_size: string | null = null;
    const sizeRaw = cell("company_size");
    if (sizeRaw) {
      const s = sizeRaw.replace(/\s+/g, "").replace(/–|—/g, "-");
      if ((COMPANY_SIZES as readonly string[]).includes(s)) company_size = s;
      else fail("company_size", `Use one of: ${COMPANY_SIZES.join(", ")}.`);
    }

    let owner_id = defaultOwner;
    const ownerRaw = founder ? cell("owner_email") : null;
    if (ownerRaw) {
      const o = owners.find((m) => m.email.toLowerCase() === ownerRaw.toLowerCase());
      if (o) owner_id = o.id;
      else fail("owner_email", `No active BD or founder has the email ${ownerRaw}.`);
    }

    const tagsR = normalizeTags(cell("tags"));
    const tags = tagsR.ok ? tagsR.value : [];
    if (!tagsR.ok) fail("tags", tagsR.error);

    // Contact: optional, but a contact needs a first name.
    let first = cell("first_name");
    let last = cell("last_name");
    const full = cell("full_name");
    if (!first && full) {
      const parts = full.split(/\s+/);
      first = parts.shift() ?? null;
      last = last ?? (parts.join(" ") || null);
    }
    const contactEmail = norm("contact_email", normalizeEmail);
    const contactPhone = norm("contact_phone", (v) => normalizePhone(v, country));
    const mobile = norm("mobile_phone", (v) => normalizePhone(v, country));
    const contactLinkedIn = norm("contact_linkedin_url", normalizeContactLinkedIn);
    const jobTitle = cell("job_title");
    const hasContactDetails = !!(last || jobTitle || contactEmail || contactPhone || mobile || contactLinkedIn);
    let contact: ImportContact | null = null;
    if (first) {
      if (first.length > 60) fail("first_name", "Keep the first name under 60 characters.");
      contact = {
        first_name: first,
        last_name: last,
        job_title: jobTitle,
        email: contactEmail,
        phone: contactPhone,
        mobile_phone: mobile,
        linkedin_url: contactLinkedIn,
      };
    } else if (hasContactDetails) {
      fail("first_name", "Add the contact's first name, or remove their details.");
    }

    if (!rowOk) continue;

    if (!contact) {
      warnings.push({ row: line, field: null, message: "No contact. Add one before outreach." });
    } else if (!(contact.email || contact.phone || contact.mobile_phone || contact.linkedin_url || company_phone)) {
      warnings.push({ row: line, field: null, message: "No email, phone or LinkedIn to reach them yet." });
    }

    const state_region = cell("state_region");
    rows.push({
      row: line,
      owner_id,
      niche_id: niche_id!,
      channel_id: channel_id!,
      campaign_id,
      priority,
      company_name: company!,
      website,
      domain: domainOf(website),
      company_phone,
      company_email,
      company_linkedin_url,
      address: cell("address"),
      city: cell("city"),
      state_region,
      country,
      lead_timezone: suggestTimezone(state_region, country),
      sub_niche: cell("sub_niche"),
      company_size,
      notes: cell("notes"),
      pain_point: cell("pain_point"),
      offer: cell("offer"),
      tags,
      contact,
    });
  }

  // Duplicates inside the file, by the same rule as the Add lead check (docs/04): same owner and the
  // same website, company name, or contact email / LinkedIn. Both rows are reported.
  const duplicateRows = new Set<number>();
  const seen = new Map<string, number>();
  for (const r of rows) {
    const keys: [string, string][] = [];
    if (r.domain) keys.push([`d:${r.owner_id}:${r.domain}`, "same website"]);
    keys.push([`n:${r.owner_id}:${r.company_name.toLowerCase()}`, "same company name"]);
    if (r.contact?.email) keys.push([`e:${r.owner_id}:${r.contact.email}`, "same contact email"]);
    if (r.contact?.linkedin_url) keys.push([`l:${r.owner_id}:${r.contact.linkedin_url}`, "same contact LinkedIn"]);
    for (const [key, reason] of keys) {
      const first = seen.get(key);
      if (first !== undefined) {
        duplicateRows.add(r.row);
        duplicateRows.add(first);
        push(r.row, null, `Duplicate of row ${first}: ${reason}.`);
        break;
      }
      seen.set(key, r.row);
    }
  }

  const missingFields: ValidationResult["missingFields"] = [];
  const note = (field: ImportField, outcome: string) => {
    if (f[field] === undefined) missingFields.push({ field, label: IMPORT_FIELDS[field].label, outcome });
  };
  note("niche", defaultNiche ? `Uses the default: ${defaultNiche.name}` : "Pick a default niche");
  note("channel", defaultChannel ? `Uses the default: ${defaultChannel.name}` : "Pick a default channel");
  if (founder) {
    const o = ctx.members.find((m) => m.id === defaultOwner);
    note("owner_email", `Owner: ${o?.full_name || o?.email || "you"}`);
  }
  note("country", "United States");
  note("priority", "Medium");
  for (const fld of ["website", "first_name", "contact_email", "contact_phone", "city", "state_region"] as ImportField[]) {
    if (fld === "first_name" && f.full_name !== undefined) continue;
    note(fld, "Left empty");
  }

  return {
    rows: badRows.size ? [] : rows,
    errors,
    errorCount,
    warnings,
    totalRows: nonBlank.length,
    blankRows,
    invalidRows: badRows.size,
    duplicateRows: duplicateRows.size,
    missingFields,
  };
}
