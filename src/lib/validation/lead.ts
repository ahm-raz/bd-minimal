import { z } from "zod";
import { COMPANY_SIZES, EMAIL_STATUSES, PRIORITIES, type EmailStatus, type LeadPriority } from "@/lib/domain";
import { isLocalDate, isValidTimeZone } from "@/lib/dates";
import {
  DEFAULT_COUNTRY,
  normalizeCompanyLinkedIn,
  normalizeContactLinkedIn,
  normalizeCount,
  normalizeEmail,
  normalizeMapsUrl,
  normalizeOtherUrl,
  normalizePhone,
  normalizeRating,
  normalizeTags,
  normalizeUpworkUrl,
  normalizeWebsite,
  type Normalized,
} from "@/lib/validation/normalize";

/**
 * One schema for the Add/Edit lead panel, shared by the form and the server action (docs/04, section 1).
 * Form values are strings; the output is cleaned up and ready for the database.
 */

export const REACH_ERROR = "Add at least one way to reach them: email, phone or LinkedIn.";
export const REACH_ERROR_UPWORK = "Add at least one way to reach them: email, phone, LinkedIn or the Upwork job URL.";
export const MAX_CONTACTS = 10;

const text = (max: number, label = "this") =>
  z
    .string()
    .trim()
    .max(max, `Keep ${label} under ${max} characters.`)
    .optional()
    .default("");

const optionalId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

export const contactFormSchema = z.object({
  id: z.string().optional(),
  first_name: z.string().trim().min(1, "Enter a first name.").max(60, "Keep the first name under 60 characters."),
  last_name: text(60, "the last name"),
  job_title: text(100, "the job title"),
  is_decision_maker: z.boolean().default(false),
  is_primary: z.boolean().default(false),
  email: text(200),
  email_status: z.enum(EMAIL_STATUSES as [EmailStatus, ...EmailStatus[]]).default("unverified"),
  secondary_email: text(200),
  phone: text(40),
  mobile_phone: text(40),
  linkedin_url: text(300),
  other_social_url: text(300),
  preferred_channel_id: optionalId,
  notes: text(2000, "notes"),
});

const leadObject = z.object({
  id: z.string().optional(),
  owner_id: optionalId,
  company_name: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters for the company name.")
    .max(120, "Keep the company name under 120 characters."),
  website: text(300),
  company_linkedin_url: text(300),
  company_phone: text(40),
  company_email: text(200),
  company_size: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .pipe(z.enum(COMPANY_SIZES).nullable()),
  sub_niche: text(100, "the sub-niche"),
  address: text(300, "the address"),
  city: text(100, "the city"),
  state_region: text(100, "the state or region"),
  country: z.string().trim().max(100).optional().default(DEFAULT_COUNTRY),
  lead_timezone: text(64),
  google_maps_url: text(500),
  google_rating: z.union([z.string(), z.number()]).optional().nullable(),
  google_review_count: z.union([z.string(), z.number()]).optional().nullable(),
  upwork_job_url: text(500),
  niche_id: z.string({ error: "Pick a niche." }).min(1, "Pick a niche.").pipe(z.uuid("Pick a niche.")),
  channel_id: z.string({ error: "Pick a channel." }).min(1, "Pick a channel.").pipe(z.uuid("Pick a channel.")),
  source_id: optionalId,
  campaign_id: optionalId,
  priority: z.enum(PRIORITIES as [LeadPriority, ...LeadPriority[]]).default("medium"),
  tags: z.array(z.string()).optional().default([]),
  pain_point: text(1000, "the pain point"),
  offer: text(1000, "the offer"),
  notes: text(5000, "notes"),
  next_action: text(200, "the next action"),
  next_action_due: z.string().optional().nullable().default(""),
  contacts: z.array(contactFormSchema).min(1, "Add the primary contact.").max(MAX_CONTACTS, `Add up to ${MAX_CONTACTS} contacts.`),
});

export type LeadFormValues = z.input<typeof leadObject>;

export type LeadContactData = {
  id?: string;
  first_name: string;
  last_name: string | null;
  job_title: string | null;
  is_decision_maker: boolean;
  is_primary: boolean;
  email: string | null;
  email_status: EmailStatus;
  secondary_email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  linkedin_url: string | null;
  other_social_url: string | null;
  preferred_channel_id: string | null;
  notes: string | null;
};

export type LeadData = {
  id?: string;
  owner_id: string | null;
  company_name: string;
  website: string | null;
  company_linkedin_url: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_size: string | null;
  sub_niche: string | null;
  address: string | null;
  city: string | null;
  state_region: string | null;
  country: string;
  lead_timezone: string | null;
  google_maps_url: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  upwork_job_url: string | null;
  niche_id: string;
  channel_id: string;
  source_id: string | null;
  campaign_id: string | null;
  priority: LeadPriority;
  tags: string[];
  pain_point: string | null;
  offer: string | null;
  notes: string | null;
  next_action: string | null;
  next_action_due: string | null;
  contacts: LeadContactData[];
};

const orNull = (v: string) => (v === "" ? null : v);

/**
 * Build the schema. `upworkChannelId` enables the Upwork exception to the reach rule
 * (an Upwork job URL counts as a way to reach them when the channel is Upwork).
 */
export function makeLeadSchema({ upworkChannelId }: { upworkChannelId: string | null }) {
  return leadObject.transform((v, ctx): LeadData => {
    const country = v.country || DEFAULT_COUNTRY;
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    const take = (r: Normalized, path: (string | number)[]): string | null => {
      if (!r.ok) {
        issue(path, r.error);
        return null;
      }
      return r.value;
    };

    const website = take(normalizeWebsite(v.website), ["website"]);
    const companyLinkedIn = take(normalizeCompanyLinkedIn(v.company_linkedin_url), ["company_linkedin_url"]);
    const companyPhone = take(normalizePhone(v.company_phone, country), ["company_phone"]);
    const companyEmail = take(normalizeEmail(v.company_email), ["company_email"]);
    const maps = take(normalizeMapsUrl(v.google_maps_url), ["google_maps_url"]);
    const upwork = take(normalizeUpworkUrl(v.upwork_job_url), ["upwork_job_url"]);

    const rating = normalizeRating(v.google_rating ?? null);
    if (!rating.ok) issue(["google_rating"], rating.error);
    const reviews = normalizeCount(v.google_review_count ?? null);
    if (!reviews.ok) issue(["google_review_count"], reviews.error);
    const tags = normalizeTags(v.tags);
    if (!tags.ok) issue(["tags"], tags.error);

    if (v.lead_timezone && !isValidTimeZone(v.lead_timezone)) issue(["lead_timezone"], "Pick a time zone from the list.");

    const due = v.next_action_due || "";
    if (due && !isLocalDate(due)) issue(["next_action_due"], "Pick a date.");
    if (v.next_action && !due) issue(["next_action_due"], "Pick a due date for the next action.");
    if (!v.next_action && due) issue(["next_action"], "Say what the next action is.");

    let anyPrimary = v.contacts.some((c) => c.is_primary);
    const contacts: LeadContactData[] = v.contacts.map((c, i) => {
      const p = (field: string) => ["contacts", i, field];
      const isPrimary = anyPrimary ? c.is_primary : i === 0;
      if (!anyPrimary && i === 0) anyPrimary = true;
      return {
        id: c.id || undefined,
        first_name: c.first_name,
        last_name: orNull(c.last_name),
        job_title: orNull(c.job_title),
        is_decision_maker: c.is_decision_maker,
        is_primary: isPrimary,
        email: take(normalizeEmail(c.email), p("email")),
        email_status: c.email_status,
        secondary_email: take(normalizeEmail(c.secondary_email), p("secondary_email")),
        phone: take(normalizePhone(c.phone, country), p("phone")),
        mobile_phone: take(normalizePhone(c.mobile_phone, country), p("mobile_phone")),
        linkedin_url: take(normalizeContactLinkedIn(c.linkedin_url), p("linkedin_url")),
        other_social_url: take(normalizeOtherUrl(c.other_social_url), p("other_social_url")),
        preferred_channel_id: c.preferred_channel_id,
        notes: orNull(c.notes),
      };
    });
    if (contacts.filter((c) => c.is_primary).length > 1) {
      let seen = false;
      for (const c of contacts) {
        if (c.is_primary && seen) c.is_primary = false;
        if (c.is_primary) seen = true;
      }
    }

    // The reach rule looks at what was typed (a typo shows its own error, not this one).
    const typed = (s: string) => s.trim() !== "";
    const contactReach = v.contacts.some(
      (c) => typed(c.email) || typed(c.phone) || typed(c.mobile_phone) || typed(c.linkedin_url),
    );
    const isUpwork = !!upworkChannelId && v.channel_id === upworkChannelId;
    const reach = contactReach || typed(v.company_phone) || (isUpwork && typed(v.upwork_job_url));
    if (!reach) issue(["reach"], isUpwork ? REACH_ERROR_UPWORK : REACH_ERROR);

    return {
      id: v.id || undefined,
      owner_id: v.owner_id,
      company_name: v.company_name,
      website,
      company_linkedin_url: companyLinkedIn,
      company_phone: companyPhone,
      company_email: companyEmail,
      company_size: v.company_size,
      sub_niche: orNull(v.sub_niche),
      address: orNull(v.address),
      city: orNull(v.city),
      state_region: orNull(v.state_region),
      country,
      lead_timezone: orNull(v.lead_timezone),
      google_maps_url: maps,
      google_rating: rating.ok ? rating.value : null,
      google_review_count: reviews.ok ? reviews.value : null,
      upwork_job_url: upwork,
      niche_id: v.niche_id,
      channel_id: v.channel_id,
      source_id: v.source_id,
      campaign_id: v.campaign_id,
      priority: v.priority,
      tags: tags.ok ? tags.value : [],
      pain_point: orNull(v.pain_point),
      offer: orNull(v.offer),
      notes: orNull(v.notes),
      next_action: orNull(v.next_action),
      next_action_due: due || null,
      contacts,
    };
  });
}

export type LeadSchema = ReturnType<typeof makeLeadSchema>;

export function emptyContact(primary = false): z.input<typeof contactFormSchema> {
  return {
    first_name: "",
    last_name: "",
    job_title: "",
    is_decision_maker: false,
    is_primary: primary,
    email: "",
    email_status: "unverified",
    secondary_email: "",
    phone: "",
    mobile_phone: "",
    linkedin_url: "",
    other_social_url: "",
    preferred_channel_id: null,
    notes: "",
  };
}

// ---------- Smaller lead actions ------------------------------------------

export const nextActionSchema = z
  .object({
    leadId: z.uuid(),
    nextAction: z.string().trim().max(200, "Keep the next action under 200 characters."),
    nextActionDue: z.string().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.nextAction && !v.nextActionDue) ctx.addIssue({ code: "custom", path: ["nextActionDue"], message: "Pick a due date." });
    if (!v.nextAction && v.nextActionDue) ctx.addIssue({ code: "custom", path: ["nextAction"], message: "Say what the next action is." });
    if (v.nextActionDue && !isLocalDate(v.nextActionDue)) ctx.addIssue({ code: "custom", path: ["nextActionDue"], message: "Pick a date." });
  });
export type NextActionInput = z.infer<typeof nextActionSchema>;

/** A single contact edited on the lead page. Phones use the lead's country. */
export function makeContactSchema(country: string | null | undefined) {
  return contactFormSchema.extend({ leadId: z.uuid() }).transform((c, ctx): LeadContactData & { leadId: string } => {
    const take = (r: Normalized, field: string): string | null => {
      if (!r.ok) {
        ctx.addIssue({ code: "custom", path: [field], message: r.error });
        return null;
      }
      return r.value;
    };
    return {
      leadId: c.leadId,
      id: c.id || undefined,
      first_name: c.first_name,
      last_name: orNull(c.last_name),
      job_title: orNull(c.job_title),
      is_decision_maker: c.is_decision_maker,
      is_primary: c.is_primary,
      email: take(normalizeEmail(c.email), "email"),
      email_status: c.email_status,
      secondary_email: take(normalizeEmail(c.secondary_email), "secondary_email"),
      phone: take(normalizePhone(c.phone, country), "phone"),
      mobile_phone: take(normalizePhone(c.mobile_phone, country), "mobile_phone"),
      linkedin_url: take(normalizeContactLinkedIn(c.linkedin_url), "linkedin_url"),
      other_social_url: take(normalizeOtherUrl(c.other_social_url), "other_social_url"),
      preferred_channel_id: c.preferred_channel_id,
      notes: orNull(c.notes),
    };
  });
}
export type ContactFormValues = z.input<typeof contactFormSchema> & { leadId: string };
