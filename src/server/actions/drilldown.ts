"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { contactName } from "@/lib/format";
import { DRILL_METRICS } from "@/lib/drill";
import { getViewer } from "@/server/auth";
import { fail, ok, type ActionResult } from "@/server/result";

/**
 * Drill-down: the rows behind a number (docs/05 section 8). Each list uses the same filters
 * as the metric definition in docs/05 section 1, as regular RLS-scoped table queries.
 */
export type { DrillMetric } from "@/lib/drill";

const schema = z.object({
  metric: z.enum(DRILL_METRICS),
  fromUtc: z.iso.datetime({ offset: true }),
  toUtc: z.iso.datetime({ offset: true }),
  userId: z.uuid().nullable().optional(),
  /** optional dimension filter (Performance breakdown) */
  nicheId: z.uuid().nullable().optional(),
  channelId: z.uuid().nullable().optional(),
  campaignId: z.uuid().nullable().optional(),
});
export type DrillInput = z.input<typeof schema>;

export type DrillRow = {
  id: string;
  leadId: string;
  company: string;
  title: string;
  detail: string | null;
  at: string;
  userId: string | null;
  value?: number | null;
};

export async function drilldown(input: DrillInput): Promise<ActionResult<DrillRow[]>> {
  if (!(await getViewer())) return fail("Your session has ended. Sign in again.");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("That list couldn't be loaded.");
  const { metric, fromUtc, toUtc, userId, nicheId, channelId, campaignId } = parsed.data;
  const supabase = await createClient();
  const LIMIT = 500;

  if (metric === "leads_added") {
    let q = supabase
      .from("leads")
      .select("id, company_name, city, state_region, created_at, created_by, niche_id, channel_id, campaign_id")
      .gte("created_at", fromUtc)
      .lt("created_at", toUtc)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (userId) q = q.eq("created_by", userId);
    if (nicheId) q = q.eq("niche_id", nicheId);
    if (channelId) q = q.eq("channel_id", channelId);
    if (campaignId) q = q.eq("campaign_id", campaignId);
    const { data, error } = await q;
    if (error) return fail("That list couldn't be loaded.");
    return ok(
      (data ?? []).map((l) => ({
        id: l.id,
        leadId: l.id,
        company: l.company_name,
        title: "Lead added",
        detail: [l.city, l.state_region].filter(Boolean).join(", ") || null,
        at: l.created_at,
        userId: l.created_by,
      })),
    );
  }

  if (["outreach", "follow_ups", "replies", "positive_replies", "meetings_booked"].includes(metric)) {
    let q = supabase
      .from("activities")
      .select(
        "id, lead_id, user_id, occurred_at, notes, category, channel_id, campaign_id, outcome_key, activity_types(name), outcomes!inner(label, is_reply, is_positive, is_meeting), leads!inner(company_name, niche_id), contacts(first_name, last_name)",
      )
      .gte("occurred_at", fromUtc)
      .lt("occurred_at", toUtc)
      .order("occurred_at", { ascending: false })
      .limit(LIMIT);
    if (metric === "outreach") q = q.eq("category", "outreach");
    if (metric === "follow_ups") q = q.eq("category", "follow_up");
    if (metric === "replies") q = q.eq("outcomes.is_reply", true);
    if (metric === "positive_replies") q = q.eq("outcomes.is_positive", true);
    if (metric === "meetings_booked") q = q.eq("outcomes.is_meeting", true);
    if (userId) q = q.eq("user_id", userId);
    if (nicheId) q = q.eq("leads.niche_id", nicheId);
    if (channelId) q = q.eq("channel_id", channelId);
    if (campaignId) q = q.eq("campaign_id", campaignId);
    const { data, error } = await q;
    if (error) return fail("That list couldn't be loaded.");
    return ok(
      (data ?? []).map((a) => ({
        id: a.id,
        leadId: a.lead_id,
        company: a.leads.company_name,
        title: `${a.activity_types?.name ?? "Activity"}, ${a.outcomes.label}`,
        detail: [a.contacts ? contactName(a.contacts) : null, a.notes].filter(Boolean).join(": ") || null,
        at: a.occurred_at,
        userId: a.user_id,
      })),
    );
  }

  if (metric === "meetings_done" || metric === "proposals_sent") {
    let q = supabase
      .from("opportunity_stage_events")
      .select("id, opportunity_id, owner_id, changed_at, opportunities!inner(title, lead_id, estimated_value, leads!inner(company_name, niche_id, channel_id, campaign_id))")
      .eq("to_stage", metric === "meetings_done" ? "meeting_done" : "proposal_sent")
      .gte("changed_at", fromUtc)
      .lt("changed_at", toUtc)
      .order("changed_at", { ascending: false })
      .limit(LIMIT);
    if (userId) q = q.eq("owner_id", userId);
    if (nicheId) q = q.eq("opportunities.leads.niche_id", nicheId);
    if (channelId) q = q.eq("opportunities.leads.channel_id", channelId);
    if (campaignId) q = q.eq("opportunities.leads.campaign_id", campaignId);
    const { data, error } = await q;
    if (error) return fail("That list couldn't be loaded.");
    // counted once per opportunity per range
    const seen = new Set<string>();
    return ok(
      (data ?? [])
        .filter((e) => (seen.has(e.opportunity_id) ? false : (seen.add(e.opportunity_id), true)))
        .map((e) => ({
          id: String(e.id),
          leadId: e.opportunities.lead_id,
          company: e.opportunities.leads.company_name,
          title: e.opportunities.title,
          detail: metric === "meetings_done" ? "Entered Meeting done" : "Entered Proposal sent",
          at: e.changed_at,
          userId: e.owner_id,
          value: Number(e.opportunities.estimated_value),
        })),
    );
  }

  if (metric === "won" || metric === "lost") {
    const col = metric === "won" ? "won_at" : "lost_at";
    let q = supabase
      .from("opportunities")
      .select("id, lead_id, owner_id, title, won_value, contract_type, monthly_amount, won_at, lost_at, lost_note, leads!inner(company_name, niche_id, channel_id, campaign_id), lost_reasons(name)")
      .eq("stage_key", metric)
      .gte(col, fromUtc)
      .lt(col, toUtc)
      .order(col, { ascending: false })
      .limit(LIMIT);
    if (userId) q = q.eq("owner_id", userId);
    if (nicheId) q = q.eq("leads.niche_id", nicheId);
    if (channelId) q = q.eq("leads.channel_id", channelId);
    if (campaignId) q = q.eq("leads.campaign_id", campaignId);
    const { data, error } = await q;
    if (error) return fail("That list couldn't be loaded.");
    return ok(
      (data ?? []).map((o) => ({
        id: o.id,
        leadId: o.lead_id,
        company: o.leads.company_name,
        title: o.title,
        detail:
          metric === "won"
            ? o.contract_type === "monthly"
              ? `Monthly, ${o.monthly_amount}/month`
              : "One-time"
            : [o.lost_reasons?.name, o.lost_note].filter(Boolean).join(": ") || null,
        at: (metric === "won" ? o.won_at : o.lost_at)!,
        userId: o.owner_id,
        value: metric === "won" ? Number(o.won_value) : null,
      })),
    );
  }

  // flagged: lead-fix tasks created in range, credited to the assignee
  let q = supabase
    .from("tasks")
    .select("id, lead_id, assignee_id, note, created_at, completed_at, leads(company_name)")
    .eq("kind", "lead_fix")
    .gte("created_at", fromUtc)
    .lt("created_at", toUtc)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (userId) q = q.eq("assignee_id", userId);
  const { data, error } = await q;
  if (error) return fail("That list couldn't be loaded.");
  return ok(
    (data ?? []).map((t) => ({
      id: t.id,
      leadId: t.lead_id ?? "",
      company: t.leads?.company_name ?? "",
      title: t.completed_at ? "Flag fixed" : "Flag open",
      detail: t.note,
      at: t.created_at,
      userId: t.assignee_id,
    })),
  );
}
