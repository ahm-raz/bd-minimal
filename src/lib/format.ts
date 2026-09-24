import { parsePhoneNumberFromString } from "libphonenumber-js";

/** "–" is shown whenever a rate has a zero denominator (docs/05, section 2). */
export const DASH = "–";

const money0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** "$12,000"; decimals only if the cents are non-zero ("$12,000.50"). USD only. */
export function formatMoney(value: number | string | null | undefined): string {
  const n = toNumber(value);
  if (n === null) return DASH;
  const cents = Math.round(n * 100);
  return cents % 100 === 0 ? money0.format(cents / 100) : money2.format(cents / 100);
}

/** Compact money for tight spots: "$3.5k", "$1.2M". */
export function formatMoneyCompact(value: number | string | null | undefined): string {
  const n = toNumber(value);
  if (n === null) return DASH;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${trimZero((n / 1_000_000).toFixed(1))}M`;
  if (abs >= 10_000) return `$${Math.round(n / 1000)}k`;
  if (abs >= 1_000) return `$${trimZero((n / 1000).toFixed(1))}k`;
  return formatMoney(n);
}

function trimZero(s: string) {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function formatNumber(value: number | string | null | undefined): string {
  const n = toNumber(value);
  return n === null ? DASH : int.format(n);
}

/** A ratio as a percentage with one decimal: 0.345 → "34.5%". */
export function formatRatio(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return DASH;
  return `${trimZero((Math.round(ratio * 1000) / 10).toFixed(1))}%`;
}

/** numerator ÷ denominator as a percentage with one decimal; "–" when the denominator is 0. */
export function formatPercent(numerator: number, denominator: number): string {
  if (!denominator) return DASH;
  return formatRatio(numerator / denominator);
}

/** A 0–100 score as "90%". */
export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return DASH;
  return `${Math.round(value)}%`;
}

/** E.164 → a friendly display. US numbers: "(512) 555-0100"; others: "+44 20 7946 0958". */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  return parsed.country === "US" || parsed.countryCallingCode === "1" ? parsed.formatNational() : parsed.formatInternational();
}

/** "Ahmed Khan" → "AK"; "Zain" → "ZA". */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** "Ahmed" → "Ahmed's"; "James" → "James'". */
export function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(n)} ${n === 1 ? singular : plural}`;
}

/** Contact display name: "Maria Lopez". */
export function contactName(c: { first_name: string; last_name?: string | null } | null | undefined): string {
  if (!c) return "";
  return [c.first_name, c.last_name].filter(Boolean).join(" ");
}
