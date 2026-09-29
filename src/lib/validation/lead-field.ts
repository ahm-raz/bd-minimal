import { z } from "zod";
import { COMPANY_SIZES } from "@/lib/domain";
import { isValidTimeZone } from "@/lib/dates";
import {
  DEFAULT_COUNTRY,
  normalizeCompanyLinkedIn,
  normalizeCount,
  normalizeEmail,
  normalizeMapsUrl,
  normalizePhone,
  normalizeRating,
  normalizeTags,
  normalizeWebsite,
} from "@/lib/validation/normalize";

/**
 * Editing one lead field in place (lead page → Details). Same cleaning rules as the full lead form
 * (lib/validation/lead.ts), applied to a single field; shared by the Details panel and the server action.
 */
export const LEAD_FIELDS = [
  "website",
  "company_linkedin_url",
  "company_phone",
  "company_email",
  "company_size",
  "niche_id",
  "sub_niche",
  "channel_id",
  "source_id",
  "campaign_id",
  "address",
  "city",
  "state_region",
  "country",
  "lead_timezone",
  "google_maps_url",
  "google_rating",
  "google_review_count",
  "pain_point",
  "offer",
  "tags",
  "notes",
] as const;
export type LeadField = (typeof LEAD_FIELDS)[number];
export type LeadFieldValue = string | number | string[] | null;

const TEXT_MAX: Partial<Record<LeadField, [number, string]>> = {
  sub_niche: [100, "the sub-niche"],
  address: [300, "the address"],
  city: [100, "the city"],
  state_region: [100, "the state or region"],
  pain_point: [1000, "the pain point"],
  offer: [1000, "the offer"],
  notes: [5000, "notes"],
};

type Parsed = { ok: true; value: LeadFieldValue } | { ok: false; error: string };
const uuid = z.uuid();

/** Clean one field's raw input. `country` is the lead's country, used to read phone numbers. */
export function parseLeadField(field: LeadField, raw: unknown, country?: string | null): Parsed {
  const str = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw);
  const fromNormalized = (r: { ok: true; value: string | null } | { ok: false; error: string }): Parsed =>
    r.ok ? { ok: true, value: r.value } : r;

  const limit = TEXT_MAX[field];
  if (limit) {
    const [max, label] = limit;
    if (str.length > max) return { ok: false, error: `Keep ${label} under ${max} characters.` };
    return { ok: true, value: str || null };
  }
  switch (field) {
    case "website":
      return fromNormalized(normalizeWebsite(str));
    case "company_linkedin_url":
      return fromNormalized(normalizeCompanyLinkedIn(str));
    case "company_phone":
      return fromNormalized(normalizePhone(str, country));
    case "company_email":
      return fromNormalized(normalizeEmail(str));
    case "google_maps_url":
      return fromNormalized(normalizeMapsUrl(str));
    case "company_size":
      if (!str) return { ok: true, value: null };
      return (COMPANY_SIZES as readonly string[]).includes(str) ? { ok: true, value: str } : { ok: false, error: "Pick a company size." };
    case "niche_id":
      return uuid.safeParse(str).success ? { ok: true, value: str } : { ok: false, error: "Pick a niche." };
    case "channel_id":
      return uuid.safeParse(str).success ? { ok: true, value: str } : { ok: false, error: "Pick a channel." };
    case "source_id":
    case "campaign_id":
      if (!str) return { ok: true, value: null };
      return uuid.safeParse(str).success ? { ok: true, value: str } : { ok: false, error: "Pick one from the list." };
    case "country":
      if (str.length > 100) return { ok: false, error: "Keep the country under 100 characters." };
      return { ok: true, value: str || DEFAULT_COUNTRY };
    case "lead_timezone":
      if (!str) return { ok: true, value: null };
      return isValidTimeZone(str) ? { ok: true, value: str } : { ok: false, error: "Pick a time zone from the list." };
    case "google_rating": {
      const r = normalizeRating(str || null);
      return r.ok ? { ok: true, value: r.value } : r;
    }
    case "google_review_count": {
      const r = normalizeCount(str || null);
      return r.ok ? { ok: true, value: r.value } : r;
    }
    case "tags": {
      const r = normalizeTags(Array.isArray(raw) ? (raw as string[]) : str);
      return r.ok ? { ok: true, value: r.value } : r;
    }
    default:
      return { ok: false, error: "That field can't be edited here." };
  }
}
