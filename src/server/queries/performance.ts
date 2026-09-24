import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isLocalDate, previousRange, RANGE_PRESETS, rangeFor, type DateRange, type RangePreset } from "@/lib/dates";
import { OPEN_STAGE_KEYS, type TargetMetric } from "@/lib/domain";
import type { Viewer } from "@/server/auth";

export type ScoreRow = {
  user_id: string;
  leads_added: number;
  outreach: number;
  follow_ups: number;
  replies: number;
  positive_replies: number;
  meetings_booked: number;
  meetings_done: number;
  proposals_sent: number;
  won_count: number;
  won_revenue: number;
  new_mrr: number;
  avg_completeness: number | null;
  flagged_leads: number;
  lost_count: number;
};

export type DimensionRow = {
  dimension_id: string;
  dimension_name: string;
  leads_added: number;
  outreach: number;
  replies: number;
  positive_replies: number;
  meetings_booked: number;
  proposals_sent: number;
  won_count: number;
  won_revenue: number;
};

export type DailyRow = {
  day: string;
  user_id: string;
  leads_added: number;
  outreach: number;
  follow_ups: number;
  replies: number;
  meetings_booked: number;
};

export type PipelineRow = { stage_key: string; stage_label: string; opp_count: number; total_value: number; weighted_value: number; stuck_count: number };

export type TaskStats = { user_id: string; due: number; on_time: number; late: number; overdue: number };

export type StuckDeal = { id: string; leadId: string; company: string; title: string; stage: string; ownerId: string; value: number; since: string };

export type PerformanceFilters = { preset: RangePreset; from: string; to: string; person: string | null; compare: boolean };

export type PerformanceData = {
  filters: PerformanceFilters;
  range: DateRange;
  previous: DateRange | null;
  scoreboard: ScoreRow[];
  previousScoreboard: ScoreRow[] | null;
  targets: { user_id: string; metric: TargetMetric; weekly_value: number }[];
  byNiche: DimensionRow[];
  byChannel: DimensionRow[];
  byCampaign: DimensionRow[];
  daily: DailyRow[];
  gridClipped: boolean;
  pipeline: PipelineRow[];
  activeMrr: number;
  stuck: StuckDeal[];
  tasks: TaskStats[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_GRID_DAYS = 31;

/** Range, person and compare from the URL. A BD is always fixed to self, whatever the URL says. */
export function parsePerformanceFilters(sp: Record<string, string | string[] | undefined>, viewer: Viewer): { filters: PerformanceFilters; range: DateRange } {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const presetRaw = one("range") ?? "this_week";
  const preset = (RANGE_PRESETS as readonly string[]).includes(presetRaw) ? (presetRaw as RangePreset) : "this_week";
  const from = one("from");
  const to = one("to");
  const range =
    preset === "custom" && from && to && isLocalDate(from) && isLocalDate(to)
      ? rangeFor("custom", viewer.timezone, new Date(), { from, to })
      : rangeFor(preset === "custom" ? "this_week" : preset, viewer.timezone);
  const isFounder = viewer.role === "founder";
  const person = isFounder ? (one("person") && UUID.test(one("person")!) ? one("person")! : null) : viewer.id;
  return {
    filters: { preset, from: range.fromDate, to: range.toDate, person, compare: isFounder && one("compare") === "1" },
    range,
  };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function scoreboard(supabase: Supabase, r: DateRange): Promise<ScoreRow[]> {
  const [{ data, error }, lost] = await Promise.all([
    supabase.rpc("metrics_scoreboard", { p_from: r.fromUtc, p_to: r.toUtc }),
    // Win rate's lost count: a direct RLS-scoped query (docs/05 section 9)
    supabase.from("opportunities").select("owner_id").eq("stage_key", "lost").gte("lost_at", r.fromUtc).lt("lost_at", r.toUtc),
  ]);
  if (error) throw new Error(`The scoreboard couldn't be loaded: ${error.message}`);
  const lostBy = new Map<string, number>();
  for (const o of lost.data ?? []) lostBy.set(o.owner_id, (lostBy.get(o.owner_id) ?? 0) + 1);
  return (data ?? []).map((s) => ({
    ...s,
    won_revenue: Number(s.won_revenue),
    new_mrr: Number(s.new_mrr),
    avg_completeness: s.avg_completeness === null ? null : Number(s.avg_completeness),
    lost_count: lostBy.get(s.user_id) ?? 0,
  }));
}

async function dimension(supabase: Supabase, r: DateRange, dim: "niche" | "channel" | "campaign", person: string | null): Promise<DimensionRow[]> {
  const { data } = await supabase.rpc("metrics_by_dimension", {
    p_from: r.fromUtc,
    p_to: r.toUtc,
    p_dimension: dim,
    ...(person ? { p_user: person } : {}),
  });
  return (data ?? []).map((d) => ({ ...d, won_revenue: Number(d.won_revenue) }));
}

/** Everything on the Performance page, from the SQL metric functions (docs/05 section 9), in parallel. */
export async function getPerformance(viewer: Viewer, filters: PerformanceFilters, range: DateRange): Promise<PerformanceData> {
  const supabase = await createClient();
  const person = filters.person;
  const previous = filters.compare ? previousRange(range, viewer.timezone) : null;
  const gridTo = range.toDate;
  const gridFrom = (() => {
    const days = Math.round((Date.parse(range.toDate) - Date.parse(range.fromDate)) / 86_400_000) + 1;
    if (days <= MAX_GRID_DAYS) return range.fromDate;
    const d = new Date(Date.parse(range.toDate) - (MAX_GRID_DAYS - 1) * 86_400_000);
    return d.toISOString().slice(0, 10);
  })();
  const stuckCutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();

  let stuckQ = supabase
    .from("opportunities")
    .select("id, lead_id, title, stage_key, owner_id, estimated_value, stage_changed_at, leads!inner(company_name)")
    .in("stage_key", OPEN_STAGE_KEYS)
    .lt("stage_changed_at", stuckCutoff)
    .order("stage_changed_at")
    .limit(50);
  if (person) stuckQ = stuckQ.eq("owner_id", person);

  const [sb, prev, targets, byNiche, byChannel, byCampaign, daily, pipeline, mrr, stuck, tasks] = await Promise.all([
    scoreboard(supabase, range),
    previous ? scoreboard(supabase, previous) : Promise.resolve(null),
    supabase.from("targets").select("user_id, metric, weekly_value"),
    dimension(supabase, range, "niche", person),
    dimension(supabase, range, "channel", person),
    dimension(supabase, range, "campaign", person),
    supabase.rpc("metrics_daily", { p_from: gridFrom, p_to: gridTo, p_tz: viewer.timezone, ...(person ? { p_user: person } : {}) }),
    supabase.rpc("pipeline_summary", person ? { p_user: person } : {}),
    supabase.rpc("active_mrr", person ? { p_user: person } : {}),
    stuckQ,
    supabase.rpc("tasks_with_progress", { p_from: range.fromDate, p_to: range.toDate, ...(person ? { p_assignee: person } : {}) }),
  ]);

  const taskStats = new Map<string, TaskStats>();
  for (const t of tasks.data ?? []) {
    const s = taskStats.get(t.assignee_id) ?? { user_id: t.assignee_id, due: 0, on_time: 0, late: 0, overdue: 0 };
    s.due++;
    if (t.status === "done") {
      if (t.completed_on_time) s.on_time++;
      else s.late++;
    } else if (t.status === "overdue") s.overdue++;
    taskStats.set(t.assignee_id, s);
  }

  const onlyPerson = <T extends { user_id: string }>(rows: T[]) => (person ? rows.filter((r) => r.user_id === person) : rows);

  return {
    filters,
    range,
    previous,
    scoreboard: onlyPerson(sb),
    previousScoreboard: prev ? onlyPerson(prev) : null,
    targets: targets.data ?? [],
    byNiche,
    byChannel,
    byCampaign,
    daily: daily.data ?? [],
    gridClipped: gridFrom !== range.fromDate,
    pipeline: (pipeline.data ?? []).map((p) => ({ ...p, total_value: Number(p.total_value), weighted_value: Number(p.weighted_value) })),
    activeMrr: Number(mrr.data ?? 0),
    stuck: (stuck.data ?? []).map((o) => ({
      id: o.id,
      leadId: o.lead_id,
      company: o.leads.company_name,
      title: o.title,
      stage: o.stage_key,
      ownerId: o.owner_id,
      value: Number(o.estimated_value),
      since: o.stage_changed_at,
    })),
    tasks: [...taskStats.values()],
  };
}
