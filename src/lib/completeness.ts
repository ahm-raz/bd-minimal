/**
 * Completeness score (docs/04, section 1). Mirrors public.recompute_lead_completeness in SQL:
 * ten checks, 10 points each. The primary contact is the one marked primary, else the first added.
 */

export type CompletenessLead = {
  website?: string | null;
  company_linkedin_url?: string | null;
  city?: string | null;
  state_region?: string | null;
  pain_point?: string | null;
  source_id?: string | null;
};

export type CompletenessContact = {
  is_primary?: boolean | null;
  is_decision_maker?: boolean | null;
  job_title?: string | null;
  linkedin_url?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile_phone?: string | null;
};

export type CompletenessCheck = {
  key: string;
  /** "Add a job title": shown as a link under the meter */
  missingLabel: string;
  /** form field to focus */
  field: string;
  done: boolean;
};

const filled = (v: string | null | undefined) => !!v && v !== "";

export function primaryContactIndex(contacts: CompletenessContact[]): number {
  const i = contacts.findIndex((c) => c.is_primary);
  return i >= 0 ? i : contacts.length ? 0 : -1;
}

export function completenessChecks(lead: CompletenessLead, contacts: CompletenessContact[]): CompletenessCheck[] {
  const pi = primaryContactIndex(contacts);
  const c = pi >= 0 ? contacts[pi]! : {};
  const p = pi >= 0 ? `contacts.${pi}` : "contacts.0";
  return [
    { key: "website", missingLabel: "Add a website", field: "website", done: filled(lead.website) },
    { key: "company_linkedin", missingLabel: "Add the company LinkedIn", field: "company_linkedin_url", done: filled(lead.company_linkedin_url) },
    {
      key: "location",
      missingLabel: "Add city and state",
      field: filled(lead.city) ? "state_region" : "city",
      done: filled(lead.city) && filled(lead.state_region),
    },
    { key: "pain_point", missingLabel: "Add a pain point", field: "pain_point", done: filled(lead.pain_point) },
    { key: "source", missingLabel: "Pick a lead source", field: "source_id", done: !!lead.source_id },
    { key: "job_title", missingLabel: "Add a job title", field: `${p}.job_title`, done: filled(c.job_title) },
    { key: "contact_linkedin", missingLabel: "Add the contact's LinkedIn", field: `${p}.linkedin_url`, done: filled(c.linkedin_url) },
    { key: "contact_email", missingLabel: "Add the contact's email", field: `${p}.email`, done: filled(c.email) },
    {
      key: "contact_phone",
      missingLabel: "Add a phone or mobile",
      field: `${p}.phone`,
      done: filled(c.phone) || filled(c.mobile_phone),
    },
    {
      key: "decision_maker",
      missingLabel: "Mark a decision maker",
      field: `${p}.is_decision_maker`,
      done: contacts.some((x) => !!x.is_decision_maker),
    },
  ];
}

export function completenessScore(lead: CompletenessLead, contacts: CompletenessContact[]): number {
  return completenessChecks(lead, contacts).filter((c) => c.done).length * 10;
}

/** Under 50% red, 50–79% amber, 80%+ green. */
export function completenessTone(score: number): "bad" | "warn" | "ok" {
  if (score >= 80) return "ok";
  if (score >= 50) return "warn";
  return "bad";
}
