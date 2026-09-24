import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/domain";
import type { LeadFormValues } from "@/lib/validation/lead";

export type LeadDetail = {
  lead: Tables<"leads">;
  contacts: Tables<"contacts">[];
  ownerEvents: Tables<"lead_owner_events">[];
  openFlags: { id: string; note: string | null; created_at: string }[];
  opportunities: Tables<"opportunities">[];
  activities: Tables<"activities">[];
  stageEvents: Tables<"opportunity_stage_events">[];
};

/** Everything the lead page needs. Returns null when RLS hides the lead (the page 404s). */
export async function getLeadDetail(id: string): Promise<LeadDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) return null;
  const [contacts, ownerEvents, flags, opportunities] = await Promise.all([
    supabase.from("contacts").select("*").eq("lead_id", id).order("is_primary", { ascending: false }).order("created_at"),
    supabase.from("lead_owner_events").select("*").eq("lead_id", id).order("changed_at", { ascending: false }),
    supabase.from("tasks").select("id, note, created_at").eq("lead_id", id).eq("kind", "lead_fix").is("completed_at", null),
    supabase.from("opportunities").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
  ]);
  const oppIds = (opportunities.data ?? []).map((o) => o.id);
  const [activities, stageEvents] = await Promise.all([
    supabase.from("activities").select("*").eq("lead_id", id).order("occurred_at", { ascending: false }).limit(500),
    oppIds.length
      ? supabase.from("opportunity_stage_events").select("*").in("opportunity_id", oppIds).order("changed_at", { ascending: false })
      : Promise.resolve({ data: [] as Tables<"opportunity_stage_events">[] }),
  ]);
  return {
    lead,
    contacts: contacts.data ?? [],
    ownerEvents: ownerEvents.data ?? [],
    openFlags: flags.data ?? [],
    opportunities: opportunities.data ?? [],
    activities: activities.data ?? [],
    stageEvents: stageEvents.data ?? [],
  };
}

/** Database row → Add/Edit form values (strings everywhere). */
export function toLeadFormValues(lead: Tables<"leads">, contacts: Tables<"contacts">[]): LeadFormValues {
  const s = (v: string | null) => v ?? "";
  return {
    id: lead.id,
    owner_id: lead.owner_id,
    company_name: lead.company_name,
    website: s(lead.website),
    company_linkedin_url: s(lead.company_linkedin_url),
    company_phone: s(lead.company_phone),
    company_email: s(lead.company_email),
    company_size: lead.company_size,
    sub_niche: s(lead.sub_niche),
    address: s(lead.address),
    city: s(lead.city),
    state_region: s(lead.state_region),
    country: lead.country,
    lead_timezone: s(lead.lead_timezone),
    google_maps_url: s(lead.google_maps_url),
    google_rating: lead.google_rating === null ? "" : String(lead.google_rating),
    google_review_count: lead.google_review_count === null ? "" : String(lead.google_review_count),
    upwork_job_url: s(lead.upwork_job_url),
    niche_id: lead.niche_id,
    channel_id: lead.channel_id,
    source_id: lead.source_id,
    campaign_id: lead.campaign_id,
    priority: lead.priority,
    tags: lead.tags,
    pain_point: s(lead.pain_point),
    offer: s(lead.offer),
    notes: s(lead.notes),
    next_action: s(lead.next_action),
    next_action_due: s(lead.next_action_due),
    contacts: [...contacts]
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.created_at.localeCompare(b.created_at))
      .map((c, i) => ({
        id: c.id,
        first_name: c.first_name,
        last_name: s(c.last_name),
        job_title: s(c.job_title),
        is_decision_maker: c.is_decision_maker,
        is_primary: i === 0,
        email: s(c.email),
        email_status: c.email_status,
        secondary_email: s(c.secondary_email),
        phone: s(c.phone),
        mobile_phone: s(c.mobile_phone),
        linkedin_url: s(c.linkedin_url),
        other_social_url: s(c.other_social_url),
        preferred_channel_id: c.preferred_channel_id,
        notes: s(c.notes),
      })),
  };
}
