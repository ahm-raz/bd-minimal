"use server";

import { createClient } from "@/lib/supabase/server";
import { contactName } from "@/lib/format";
import { getViewer } from "@/server/auth";
import { ok, type ActionResult } from "@/server/result";

export type SearchResults = {
  leads: { id: string; label: string; hint: string | null }[];
  contacts: { id: string; leadId: string; label: string; hint: string }[];
  opportunities: { id: string; leadId: string; label: string; hint: string }[];
};

const EMPTY: SearchResults = { leads: [], contacts: [], opportunities: [] };

/**
 * Command menu search (docs/07 section 14): own leads for BDs, all for the founder (RLS decides),
 * up to 8 results per group.
 */
export async function searchEverything(input: { q: string }): Promise<ActionResult<SearchResults>> {
  if (!(await getViewer())) return ok(EMPTY);
  const q = (input.q ?? "").trim().replace(/[%_\\,()]/g, " ").slice(0, 80);
  if (q.length < 2) return ok(EMPTY);
  const like = `%${q}%`;
  const supabase = await createClient();
  const [leads, contacts, opps] = await Promise.all([
    supabase.from("leads").select("id, company_name, city, state_region").or(`company_name.ilike.${like},domain.ilike.${like}`).order("updated_at", { ascending: false }).limit(8),
    supabase
      .from("contacts")
      .select("id, lead_id, first_name, last_name, email, job_title, leads!inner(company_name)")
      .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`)
      .limit(8),
    supabase.from("opportunities").select("id, lead_id, title, stage_key, leads!inner(company_name)").ilike("title", like).limit(8),
  ]);
  return ok({
    leads: (leads.data ?? []).map((l) => ({ id: l.id, label: l.company_name, hint: [l.city, l.state_region].filter(Boolean).join(", ") || null })),
    contacts: (contacts.data ?? []).map((c) => ({
      id: c.id,
      leadId: c.lead_id,
      label: contactName(c),
      hint: [c.job_title, c.leads.company_name].filter(Boolean).join(", "),
    })),
    opportunities: (opps.data ?? []).map((o) => ({ id: o.id, leadId: o.lead_id, label: o.title, hint: o.leads.company_name })),
  });
}
