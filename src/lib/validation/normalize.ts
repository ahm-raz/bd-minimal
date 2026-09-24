import { getCountries, isValidPhoneNumber, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Clean-up rules for lead and contact fields (docs/04, section 1).
 * Each normaliser returns `{ ok: true, value }` (value null for empty input) or `{ ok: false, error }`.
 */
export type Normalized = { ok: true; value: string | null } | { ok: false; error: string };

const ok = (value: string | null): Normalized => ({ ok: true, value });
const bad = (error: string): Normalized => ({ ok: false, error });

function blank(v: string | null | undefined): boolean {
  return v === null || v === undefined || v.trim() === "";
}

function parseUrl(raw: string): URL | null {
  const v = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

/** Website: trim; add https:// if missing; lowercase host. Valid when it parses with a dot in the host. */
export function normalizeWebsite(raw: string | null | undefined): Normalized {
  if (blank(raw)) return ok(null);
  const url = parseUrl(raw!);
  if (!url || !url.hostname.includes(".") || /\s/.test(raw!.trim()) || url.hostname.endsWith(".")) {
    return bad("Enter a website like brightsmile.com.");
  }
  url.hostname = url.hostname.toLowerCase();
  let out = url.toString();
  // "https://brightsmile.com/" -> "https://brightsmile.com"
  if (url.pathname === "/" && !url.search && !url.hash) out = out.replace(/\/$/, "");
  return ok(out);
}

/** The domain the database derives from a website (mirrors derive_lead_domain). */
export function domainOf(website: string | null | undefined): string | null {
  if (blank(website)) return null;
  let d = website!.trim().replace(/^[a-zA-Z]+:\/\//, "").replace(/^www\./i, "").toLowerCase();
  d = d.split("/")[0]!.split("?")[0]!.split("#")[0]!;
  return d || null;
}

function linkedIn(raw: string | null | undefined, kinds: string[], canonical: string, example: string): Normalized {
  if (blank(raw)) return ok(null);
  const url = parseUrl(raw!);
  if (!url || !/(^|\.)linkedin\.com$/i.test(url.hostname)) return bad(`Enter a LinkedIn URL like ${example}.`);
  const parts = url.pathname.split("/").filter(Boolean);
  const kind = parts[0]?.toLowerCase();
  const slug = parts[1];
  if (!kind || !kinds.includes(kind) || !slug) return bad(`Enter a LinkedIn URL like ${example}.`);
  const prefix = kind === "school" ? "school" : canonical;
  return ok(`https://www.linkedin.com/${prefix}/${decodeURIComponent(slug)}`);
}

/** Company LinkedIn: strip query and trailing slash; force https://www.linkedin.com/company/<slug> (or /school/). */
export function normalizeCompanyLinkedIn(raw: string | null | undefined): Normalized {
  return linkedIn(raw, ["company", "school"], "company", "linkedin.com/company/bright-smile");
}

/** Contact LinkedIn: force https://www.linkedin.com/in/<slug>. */
export function normalizeContactLinkedIn(raw: string | null | undefined): Normalized {
  return linkedIn(raw, ["in"], "in", "linkedin.com/in/maria-lopez");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Emails: trim, lowercase; standard pattern. */
export function normalizeEmail(raw: string | null | undefined): Normalized {
  if (blank(raw)) return ok(null);
  const v = raw!.trim().toLowerCase();
  if (!EMAIL_RE.test(v) || v.includes("..")) return bad("Enter a valid email address, like maria@brightsmile.com.");
  return ok(v);
}

// ---------- Countries and phones ----------------------------------------

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** Country names (English) for every calling region libphonenumber knows, sorted. */
export const COUNTRIES: { code: CountryCode; name: string }[] = getCountries()
  .map((code) => ({ code, name: code === "US" ? "United States" : (regionNames.of(code) ?? code) }))
  .sort((a, b) => a.name.localeCompare(b.name));

const COUNTRY_BY_NAME = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c.code]));
COUNTRY_BY_NAME.set("usa", "US");
COUNTRY_BY_NAME.set("us", "US");
COUNTRY_BY_NAME.set("united states of america", "US");
COUNTRY_BY_NAME.set("uk", "GB");

export const DEFAULT_COUNTRY = "United States";

/** Country name → ISO code; blank or unknown → US (docs/04: default country from lead country, US if blank). */
export function countryCode(country: string | null | undefined): CountryCode {
  if (blank(country)) return "US";
  return COUNTRY_BY_NAME.get(country!.trim().toLowerCase()) ?? "US";
}

export function countryName(code: CountryCode): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

/** Phones: parse with the lead's country as default; store E.164. */
export function normalizePhone(raw: string | null | undefined, country?: string | null): Normalized {
  if (blank(raw)) return ok(null);
  const code = countryCode(country);
  const v = raw!.trim();
  const message = `This phone number isn't valid for ${countryName(code)}. Include the area code.`;
  if (!/^[+\d\s().\-/x]+$/i.test(v)) return bad(message);
  if (!isValidPhoneNumber(v, code)) return bad(message);
  const parsed = parsePhoneNumberFromString(v, code);
  return parsed ? ok(parsed.number) : bad(message);
}

/** Google Maps URL: trim; host contains google. or goo.gl or maps.app.goo.gl. */
export function normalizeMapsUrl(raw: string | null | undefined): Normalized {
  if (blank(raw)) return ok(null);
  const url = parseUrl(raw!);
  if (!url || !(/(^|\.)google\./i.test(url.hostname) || /(^|\.)goo\.gl$/i.test(url.hostname))) {
    return bad("Enter a Google Maps link, like maps.app.goo.gl/… or google.com/maps/….");
  }
  return ok(url.toString());
}

/** Upwork job URL: trim; host ends with upwork.com. */
export function normalizeUpworkUrl(raw: string | null | undefined): Normalized {
  if (blank(raw)) return ok(null);
  const url = parseUrl(raw!);
  if (!url || !/(^|\.)upwork\.com$/i.test(url.hostname)) return bad("Enter an Upwork job link, like upwork.com/jobs/….");
  return ok(url.toString());
}

/** Other social URL (per contact): any http(s) URL with a dotted host. */
export function normalizeOtherUrl(raw: string | null | undefined): Normalized {
  if (blank(raw)) return ok(null);
  const url = parseUrl(raw!);
  if (!url || !url.hostname.includes(".")) return bad("Enter a full link, like x.com/mariadds.");
  return ok(url.toString());
}

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

/** Tags: trim, lowercase, dedupe; max 10, 30 characters each. */
export function normalizeTags(raw: string[] | string | null | undefined): { ok: true; value: string[] } | { ok: false; error: string } {
  const list = Array.isArray(raw) ? raw : (raw ?? "").split(",");
  const out: string[] = [];
  for (const t of list) {
    const v = t.trim().toLowerCase().replace(/\s+/g, " ");
    if (!v) continue;
    if (v.length > MAX_TAG_LENGTH) return { ok: false, error: `Keep each tag to ${MAX_TAG_LENGTH} characters or fewer.` };
    if (!out.includes(v)) out.push(v);
  }
  if (out.length > MAX_TAGS) return { ok: false, error: `Use up to ${MAX_TAGS} tags.` };
  return { ok: true, value: out };
}

/** Google rating: one decimal, 0.0–5.0. */
export function normalizeRating(raw: string | number | null | undefined): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return { ok: true, value: null };
  const n = typeof raw === "number" ? raw : Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 5) return { ok: false, error: "Use a rating from 0.0 to 5.0." };
  return { ok: true, value: Math.round(n * 10) / 10 };
}

/** Review count: whole number ≥ 0. */
export function normalizeCount(raw: string | number | null | undefined): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return { ok: true, value: null };
  const n = typeof raw === "number" ? raw : Number(raw.trim().replace(/,/g, ""));
  if (!Number.isInteger(n) || n < 0) return { ok: false, error: "Use a whole number, 0 or more." };
  return { ok: true, value: n };
}

// ---------- Lead time zone from US state ---------------------------------

const EASTERN = "America/New_York";
const CENTRAL = "America/Chicago";
const MOUNTAIN = "America/Denver";
const PACIFIC = "America/Los_Angeles";

/** Main time zone per US state (by postal code). A suggestion only; the user can change it. */
const STATE_TZ: Record<string, string> = {
  AL: CENTRAL, AK: "America/Anchorage", AZ: "America/Phoenix", AR: CENTRAL, CA: PACIFIC, CO: MOUNTAIN,
  CT: EASTERN, DE: EASTERN, DC: EASTERN, FL: EASTERN, GA: EASTERN, HI: "Pacific/Honolulu", ID: "America/Boise",
  IL: CENTRAL, IN: "America/Indiana/Indianapolis", IA: CENTRAL, KS: CENTRAL, KY: EASTERN, LA: CENTRAL,
  ME: EASTERN, MD: EASTERN, MA: EASTERN, MI: "America/Detroit", MN: CENTRAL, MS: CENTRAL, MO: CENTRAL,
  MT: MOUNTAIN, NE: CENTRAL, NV: PACIFIC, NH: EASTERN, NJ: EASTERN, NM: MOUNTAIN, NY: EASTERN, NC: EASTERN,
  ND: CENTRAL, OH: EASTERN, OK: CENTRAL, OR: PACIFIC, PA: EASTERN, RI: EASTERN, SC: EASTERN, SD: CENTRAL,
  TN: CENTRAL, TX: CENTRAL, UT: MOUNTAIN, VT: EASTERN, VA: EASTERN, WA: PACIFIC, WV: EASTERN, WI: CENTRAL,
  WY: MOUNTAIN, PR: "America/Puerto_Rico",
};

const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", "district of columbia": "DC", "washington dc": "DC", florida: "FL", georgia: "GA", hawaii: "HI",
  idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME",
  maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN",
  texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "puerto rico": "PR",
};

/** "TX" or "Texas" → "America/Chicago"; null when unknown or the country isn't the US. */
export function suggestTimezone(state: string | null | undefined, country?: string | null): string | null {
  if (blank(state)) return null;
  if (!blank(country) && countryCode(country) !== "US") return null;
  const v = state!.trim();
  const code = v.length === 2 ? v.toUpperCase() : STATE_NAMES[v.toLowerCase().replace(/\./g, "")];
  return code ? (STATE_TZ[code] ?? null) : null;
}

// ---------- Paste helpers --------------------------------------------------

/** Pasting into First name: a LinkedIn URL moves to the LinkedIn field; "First Last" splits (docs/07 section 4). */
export function splitPastedName(text: string): { linkedin?: string; first?: string; last?: string } {
  const v = text.trim();
  if (/linkedin\.com\/in\//i.test(v)) return { linkedin: v };
  const parts = v.split(/\s+/).filter(Boolean);
  // Keep an honorific with the first name: "Dr. Maria Lopez" -> "Dr. Maria" + "Lopez".
  if (parts.length >= 3 && /^(dr|mr|mrs|ms|miss|prof)\.?$/i.test(parts[0]!)) {
    parts.splice(0, 2, `${parts[0]} ${parts[1]}`);
  }
  if (parts.length >= 2 && parts.length <= 4 && !/[@/]/.test(v)) {
    return { first: parts[0], last: parts.slice(1).join(" ") };
  }
  return { first: v };
}
