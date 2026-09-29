/**
 * CSV header → lead field mapping (docs/04, CSV import). One alias table, no special cases elsewhere.
 * Headers are compared without case, spaces, underscores or punctuation ("First Name" = first_name = firstName).
 * Ambiguous headers are never guessed: they're reported, or resolved by one stated rule.
 */

export const IMPORT_FIELDS = {
  company_name: { label: "Company name", aliases: ["companyname", "company", "business", "businessname", "organization", "organisation", "account", "accountname"] },
  website: { label: "Website", aliases: ["website", "site", "url", "web", "companywebsite", "domain", "websiteurl"] },
  company_phone: { label: "Company phone", aliases: ["companyphone", "officephone", "mainphone", "businessphone", "phoneoffice"] },
  company_email: { label: "Company email", aliases: ["companyemail", "officeemail", "generalemail", "infoemail"] },
  company_linkedin_url: { label: "Company LinkedIn", aliases: ["companylinkedin", "companylinkedinurl", "linkedincompany", "companylinkedinpage"] },
  address: { label: "Address", aliases: ["address", "streetaddress", "street"] },
  city: { label: "City", aliases: ["city", "town"] },
  state_region: { label: "State or region", aliases: ["state", "region", "stateregion", "province", "county"] },
  country: { label: "Country", aliases: ["country", "countryname"] },
  sub_niche: { label: "Sub-niche", aliases: ["subniche", "specialty", "speciality", "subindustry"] },
  company_size: { label: "Company size", aliases: ["companysize", "size", "employees", "headcount", "employeecount"] },
  notes: { label: "Notes", aliases: ["notes", "note", "comments", "comment", "remarks"] },
  pain_point: { label: "Pain point", aliases: ["painpoint", "pain", "problem"] },
  offer: { label: "Offer", aliases: ["offer", "pitch", "angle"] },
  tags: { label: "Tags", aliases: ["tags", "tag", "labels"] },
  niche: { label: "Niche", aliases: ["niche", "industry", "vertical", "segment"] },
  channel: { label: "Channel", aliases: ["channel", "outreachchannel"] },
  campaign: { label: "Campaign", aliases: ["campaign", "campaignname"] },
  priority: { label: "Priority", aliases: ["priority"] },
  owner_email: { label: "Owner email", aliases: ["owneremail", "owner", "assignedto", "assignee", "bdemail", "bd"] },
  first_name: { label: "Contact first name", aliases: ["firstname", "first", "givenname", "contactfirstname", "fname"] },
  last_name: { label: "Contact last name", aliases: ["lastname", "last", "surname", "familyname", "contactlastname", "lname"] },
  full_name: { label: "Contact full name", aliases: ["fullname", "contactname", "contact", "contactfullname", "person", "decisionmaker"] },
  job_title: { label: "Job title", aliases: ["jobtitle", "title", "position", "role", "designation"] },
  contact_email: { label: "Contact email", aliases: ["contactemail", "emailaddress", "workemail", "personalemail"] },
  contact_phone: { label: "Contact phone", aliases: ["contactphone", "directphone", "workphone", "phonenumber"] },
  mobile_phone: { label: "Contact mobile", aliases: ["mobile", "mobilephone", "cell", "cellphone", "contactmobile", "whatsapp"] },
  contact_linkedin_url: { label: "Contact LinkedIn", aliases: ["contactlinkedin", "linkedinprofile", "personallinkedin", "linkedinurl"] },
} as const;

export type ImportField = keyof typeof IMPORT_FIELDS;

/** Columns we recognise but don't import, with the reason shown to the user. */
const IGNORED: Record<string, string> = {
  status: "Status is set automatically from activity.",
  leadstatus: "Status is set automatically from activity.",
  stage: "Stages belong to opportunities; create them after import.",
  source: "Imported leads get the source CSV import.",
  leadsource: "Imported leads get the source CSV import.",
  nextaction: "Plan next actions after import.",
  nextactiondue: "Plan next actions after import.",
  id: "Lead ids are created by the app.",
  leadid: "Lead ids are created by the app.",
  createdat: "The import time is recorded instead.",
  created: "The import time is recorded instead.",
};

/** "email", "phone" and "linkedin" alone: contact's when there's a contact name column, else the company's. */
const SPLIT: Record<string, { contact: ImportField; company: ImportField }> = {
  email: { contact: "contact_email", company: "company_email" },
  phone: { contact: "contact_phone", company: "company_phone" },
  telephone: { contact: "contact_phone", company: "company_phone" },
  linkedin: { contact: "contact_linkedin_url", company: "company_linkedin_url" },
};

/** Too vague to map: the user must rename them. */
const AMBIGUOUS: Record<string, string> = {
  name: 'Rename "Name" to "Company name" or "Contact name".',
};

export function headerKey(h: string): string {
  return h
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const ALIAS = new Map<string, ImportField>();
for (const [field, def] of Object.entries(IMPORT_FIELDS) as [ImportField, (typeof IMPORT_FIELDS)[ImportField]][]) {
  ALIAS.set(headerKey(field), field);
  for (const a of def.aliases) ALIAS.set(a, field);
}

export type ColumnMapping = {
  index: number;
  header: string;
  field: ImportField | null;
  /** Why it isn't imported, or how an ambiguous header was read. */
  note?: string;
};

export type MappingResult = {
  columns: ColumnMapping[];
  /** field → column index */
  fields: Partial<Record<ImportField, number>>;
  errors: string[];
  warnings: string[];
};

export function mapColumns(header: string[]): MappingResult {
  const columns: ColumnMapping[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenHeaders = new Map<string, number>();
  const keys = header.map(headerKey);
  const hasContactName = keys.some((k) => {
    const f = ALIAS.get(k);
    return f === "first_name" || f === "last_name" || f === "full_name";
  });

  keys.forEach((key, index) => {
    const raw = header[index] ?? "";
    if (!key) {
      columns.push({ index, header: raw, field: null, note: "Empty header; not imported." });
      if (raw.trim() !== "" || index < header.length - 1) warnings.push(`Column ${index + 1} has no header and isn't imported.`);
      return;
    }
    const prev = seenHeaders.get(key);
    if (prev !== undefined) {
      errors.push(`Columns ${prev + 1} and ${index + 1} are both "${raw}". Rename or remove one.`);
    } else {
      seenHeaders.set(key, index);
    }
    if (AMBIGUOUS[key]) {
      errors.push(AMBIGUOUS[key]!);
      columns.push({ index, header: raw, field: null, note: "Ambiguous" });
      return;
    }
    const split = SPLIT[key];
    if (split) {
      const field = hasContactName ? split.contact : split.company;
      columns.push({
        index,
        header: raw,
        field,
        note: hasContactName ? "Read as the contact's, because the file has a contact name." : "Read as the company's, because the file has no contact name.",
      });
      return;
    }
    const field = ALIAS.get(key) ?? null;
    if (field) {
      columns.push({ index, header: raw, field });
      return;
    }
    const reason = IGNORED[key];
    columns.push({ index, header: raw, field: null, note: reason ?? "Not a lead field." });
    warnings.push(`Column "${raw}" isn't imported. ${reason ?? "It doesn't match a lead field."}`);
  });

  const fields: Partial<Record<ImportField, number>> = {};
  for (const c of columns) {
    if (!c.field) continue;
    const taken = fields[c.field];
    if (taken !== undefined) {
      errors.push(
        `"${header[taken]}" and "${c.header}" both map to ${IMPORT_FIELDS[c.field].label}. Keep one of them.`,
      );
      continue;
    }
    fields[c.field] = c.index;
  }
  if (fields.full_name !== undefined && fields.first_name !== undefined) {
    warnings.push(`"${header[fields.full_name]}" isn't used, because the file has a first-name column.`);
    delete fields.full_name;
  }
  if (fields.company_name === undefined) errors.push('Add a "Company name" column. Every lead needs one.');
  return { columns, fields, errors, warnings };
}

/** Header row for the downloadable template. */
export const TEMPLATE_HEADERS = [
  "Company name",
  "Website",
  "Niche",
  "Channel",
  "City",
  "State",
  "Country",
  "First name",
  "Last name",
  "Job title",
  "Contact email",
  "Contact phone",
  "Contact LinkedIn",
  "Company phone",
  "Priority",
  "Tags",
  "Notes",
  "Owner email",
];
