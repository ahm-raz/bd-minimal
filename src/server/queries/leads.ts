import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CLOSED_LEAD_STATUSES, type LeadPriority, type LeadStatus } from "@/lib/domain";
import { addDays, localRange, startOfWeek, todayIn } from "@/lib/dates";
import type { LeadFilters } from "@/lib/lead-filters";
import type { Viewer } from "@/server/auth";

export type LeadRow = {
  id: string;
  company_name: string;
  city: string | null;
  state_region: string | null;
  status: LeadStatus;
  priority: LeadPriority;
  niche_id: string;
  channel_id: string;
  campaign_id: string | null;
  source_id: string | null;
  next_action: string | null;
  next_action_due: string | null;
  completeness: number;
  last_activity_at: string | null;
  owner_id: string;
  created_at: string;
  tags: string[];
  contact: { first_name: string; last_name: string | null; job_title: string | null } | null;
  flagged: boolean;
};

const CLOSED = `(${CLOSED_LEAD_STATUSES.join(",")})`;

/** Lead ids with an open lead-fix task (the red flag badge). */
export async function flaggedLeadIds(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("tasks").select("lead_id").eq("kind", "lead_fix").is("completed_at", null);
  return new Set((data ?? []).flatMap((t) => (t.lead_id ? [t.lead_id] : [])));
}

function like(q: string) {
  return `%${q.replace(/[%_\\,()]/g, " ").trim()}%`;
}

/**
 * Leads for the list. RLS decides what the caller can see; the owner filters here are
 * only the "My open leads" / owner filter UX.
 */
export async function fetchLeads(f: LeadFilters, viewer: Viewer): Promise<{ rows: LeadRow[]; total: number }> {
  const supabase = await createClient();
  const today = todayIn(viewer.timezone);
  const flagged = await flaggedLeadIds();

  let query = supabase
    .from("leads")
    .select(
      "id, company_name, city, state_region, status, priority, niche_id, channel_id, campaign_id, source_id, next_action, next_action_due, completeness, last_activity_at, owner_id, created_at, tags, contacts(first_name, last_name, job_title, is_primary, created_at)",
      { count: "exact" },
    );

  // Views
  switch (f.view) {
    case "mine":
      query = query.eq("owner_id", viewer.id).not("status", "in", CLOSED);
      break;
    case "no_next":
      query = query.is("next_action_due", null).not("status", "in", CLOSED);
      break;
    case "overdue":
      query = query.lt("next_action_due", today).not("status", "in", CLOSED);
      break;
    case "incomplete":
      query = query.lt("completeness", 50);
      break;
    case "customers":
      query = query.eq("status", "customer");
      break;
    case "flagged":
      query = query.in("id", [...flagged].length ? [...flagged] : ["00000000-0000-0000-0000-000000000000"]);
      break;
    case "all":
      break;
  }

  // Search: company, domain, contact name, email, phone, LinkedIn URL
  if (f.q) {
    const pattern = like(f.q);
    const digits = f.q.replace(/\D/g, "");
    const contactFilters = [
      `first_name.ilike.${pattern}`,
      `last_name.ilike.${pattern}`,
      `email.ilike.${pattern}`,
      `linkedin_url.ilike.${pattern}`,
    ];
    if (digits.length >= 4) contactFilters.push(`phone.ilike.%${digits}%`, `mobile_phone.ilike.%${digits}%`);
    const { data: contactHits } = await supabase.from("contacts").select("lead_id").or(contactFilters.join(",")).limit(500);
    const ids = [...new Set((contactHits ?? []).map((c) => c.lead_id))];
    const leadFilters = [`company_name.ilike.${pattern}`, `domain.ilike.${pattern}`];
    if (digits.length >= 4) leadFilters.push(`company_phone.ilike.%${digits}%`);
    if (ids.length) leadFilters.push(`id.in.(${ids.join(",")})`);
    query = query.or(leadFilters.join(","));
  }

  // Filters (combine with AND)
  if (f.status.length) query = query.in("status", f.status);
  if (f.niche) query = query.eq("niche_id", f.niche);
  if (f.channel) query = query.eq("channel_id", f.channel);
  if (f.campaign) query = query.eq("campaign_id", f.campaign);
  if (f.source) query = query.eq("source_id", f.source);
  if (f.batch) query = query.eq("import_batch_id", f.batch);
  if (f.priority) query = query.eq("priority", f.priority);
  if (f.owner) query = query.eq("owner_id", f.owner);
  if (f.due === "overdue") query = query.lt("next_action_due", today);
  if (f.due === "today") query = query.eq("next_action_due", today);
  if (f.due === "week") query = query.gte("next_action_due", today).lte("next_action_due", addDays(startOfWeek(today), 6));
  if (f.due === "none") query = query.is("next_action_due", null);
  if (f.comp === "lt50") query = query.lt("completeness", 50);
  if (f.comp === "50to79") query = query.gte("completeness", 50).lt("completeness", 80);
  if (f.comp === "80plus") query = query.gte("completeness", 80);
  if (f.from || f.to) {
    const a = f.from ?? f.to!;
    const b = f.to ?? f.from!;
    // A reversed range (to before from) means the same days, like rangeFor("custom").
    const r = a <= b ? localRange(a, b, viewer.timezone) : localRange(b, a, viewer.timezone);
    query = query.gte("created_at", r.fromUtc).lt("created_at", r.toUtc);
  }
  if (f.flagged) query = query.in("id", [...flagged].length ? [...flagged] : ["00000000-0000-0000-0000-000000000000"]);
  if (f.tags.length) query = query.overlaps("tags", f.tags);

  const sortColumn = {
    company: "company_name",
    status: "status",
    due: "next_action_due",
    completeness: "completeness",
    last_activity: "last_activity_at",
    created: "created_at",
  }[f.sort];
  query = query.order(sortColumn, { ascending: f.dir === "asc", nullsFirst: false }).order("id").limit(f.limit);

  const { data, count, error } = await query;
  if (error) throw new Error(`Leads couldn't be loaded: ${error.message}`);

  const rows: LeadRow[] = (data ?? []).map((l) => {
    const contacts = [...(l.contacts ?? [])].sort(
      (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.created_at.localeCompare(b.created_at),
    );
    const c = contacts[0];
    const { contacts: _c, ...rest } = l;
    void _c;
    return {
      ...rest,
      contact: c ? { first_name: c.first_name, last_name: c.last_name, job_title: c.job_title } : null,
      flagged: flagged.has(l.id),
    };
  });
  return { rows, total: count ?? rows.length };
}
