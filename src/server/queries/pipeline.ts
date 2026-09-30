import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ContractType } from "@/lib/domain";

export type PipelineCard = {
  id: string;
  leadId: string;
  company: string;
  nicheId: string;
  title: string;
  stage: string;
  ownerId: string;
  estimatedValue: number;
  wonValue: number | null;
  contractType: ContractType | null;
  monthlyAmount: number;
  expectedCloseDate: string | null;
  stageChangedAt: string;
  createdAt: string;
};

export type PipelineFilters = { owner: string | null; niche: string | null; showAll: boolean; stuck: boolean; view: "board" | "list" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePipelineFilters(sp: Record<string, string | string[] | undefined>, isFounder: boolean): PipelineFilters {
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const owner = one("owner");
  const niche = one("niche");
  return {
    owner: isFounder && owner && UUID.test(owner) ? owner : null,
    niche: niche && UUID.test(niche) ? niche : null,
    showAll: one("closed") === "all",
    stuck: one("stuck") === "1",
    view: one("view") === "list" ? "list" : "board",
  };
}

/**
 * Opportunities for the board. RLS limits BDs to their own. Won and Lost columns show only
 * cards that changed in the last 30 days unless "Show all" is on (docs/05 section 4).
 */
export async function fetchPipeline(f: PipelineFilters): Promise<PipelineCard[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  let q = supabase
    .from("opportunities")
    .select(
      "id, lead_id, title, stage_key, owner_id, estimated_value, won_value, contract_type, monthly_amount, expected_close_date, stage_changed_at, created_at, leads!inner(company_name, niche_id)",
    )
    .order("stage_changed_at", { ascending: false })
    .limit(2000);
  if (f.owner) q = q.eq("owner_id", f.owner);
  if (f.niche) q = q.eq("leads.niche_id", f.niche);
  if (!f.showAll) q = q.or(`stage_key.not.in.(won,lost),stage_changed_at.gte.${since}`);
  const { data, error } = await q;
  if (error) throw new Error(`The pipeline couldn't be loaded: ${error.message}`);
  return (data ?? []).map((o) => ({
    id: o.id,
    leadId: o.lead_id,
    company: o.leads.company_name,
    nicheId: o.leads.niche_id,
    title: o.title,
    stage: o.stage_key,
    ownerId: o.owner_id,
    estimatedValue: Number(o.estimated_value),
    wonValue: o.won_value === null ? null : Number(o.won_value),
    contractType: o.contract_type,
    monthlyAmount: Number(o.monthly_amount),
    expectedCloseDate: o.expected_close_date,
    stageChangedAt: o.stage_changed_at,
    createdAt: o.created_at,
  }));
}

export type PipelineTotals = { openValue: number; weightedValue: number; stuck: number };

/** Top bar totals from pipeline_summary (docs/05 section 4), for the selected owner and niche, like the board. */
export async function fetchPipelineTotals(owner: string | null, niche: string | null = null): Promise<PipelineTotals> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("pipeline_summary", {
    ...(owner ? { p_user: owner } : {}),
    ...(niche ? { p_niche: niche } : {}),
  });
  const open = (data ?? []).filter((r) => !["won", "lost"].includes(r.stage_key));
  return {
    openValue: open.reduce((s, r) => s + Number(r.total_value), 0),
    weightedValue: open.reduce((s, r) => s + Number(r.weighted_value), 0),
    stuck: open.reduce((s, r) => s + r.stuck_count, 0),
  };
}
