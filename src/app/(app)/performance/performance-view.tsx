"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { StageChip } from "@/components/common/chips";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, Panel, PanelHeader, StatBlock, StatGrid } from "@/components/common/page";
import { PaceBar } from "@/components/common/pace-bar";
import { SelectField } from "@/components/common/select-field";
import { DrilldownSheet, type DrillRequest } from "@/components/metrics/drilldown-sheet";
import { PerformanceTabs } from "./performance-tabs";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { RANGE_PRESET_LABELS, eachDay, isWeekend, todayIn, weekdayShort, type RangePreset } from "@/lib/dates";
import { METRIC_LABELS, type TargetMetric } from "@/lib/domain";
import type { DrillMetric } from "@/lib/drill";
import { formatMoney, formatNumber, formatRatio, firstName, possessive } from "@/lib/format";
import {
  achievement,
  dailyTarget,
  dayPaceMarker,
  gridShade,
  meetingRate,
  positiveReplyRate,
  proposalRate,
  rangeTarget,
  rate,
  replyRate,
  weekPaceMarker,
  winRate,
} from "@/lib/metrics";
import { useNow } from "@/lib/use-now";
import type { DimensionRow, PerformanceData, ScoreRow } from "@/server/queries/performance";

const PRESETS: RangePreset[] = ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "last_7_days", "last_30_days", "custom"];

type Totals = Omit<ScoreRow, "user_id" | "avg_completeness"> & { avg_completeness: number | null };

function sum(rows: ScoreRow[]): Totals {
  const t: Totals = {
    leads_added: 0, outreach: 0, follow_ups: 0, replies: 0, positive_replies: 0, meetings_booked: 0, meetings_done: 0,
    proposals_sent: 0, won_count: 0, won_revenue: 0, new_mrr: 0, avg_completeness: null, flagged_leads: 0, lost_count: 0,
  };
  let compW = 0;
  let compSum = 0;
  for (const r of rows) {
    for (const k of Object.keys(t) as (keyof Totals)[]) {
      if (k === "avg_completeness") continue;
      (t[k] as number) += Number(r[k] ?? 0);
    }
    if (r.avg_completeness !== null) {
      compSum += r.avg_completeness * r.leads_added;
      compW += r.leads_added;
    }
  }
  t.avg_completeness = compW ? Math.round(compSum / compW) : null;
  return t;
}

export function PerformanceView({ data }: { data: PerformanceData }) {
  const { lists, department } = useApp();
  const profile = useProfile();
  const isFounder = profile.role === "founder";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const now = useNow();
  const today = todayIn(profile.timezone);
  const [drill, setDrill] = useState<DrillRequest | null>(null);
  const f = data.filters;
  const member = (id: string) => lists.members.find((m) => m.id === id);
  const who = f.person ? member(f.person) : null;

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const open = (metric: DrillMetric, label: string, userId: string | null = f.person, extra: Partial<DrillRequest> = {}) =>
    setDrill({ metric, label, fromUtc: data.range.fromUtc, toUtc: data.range.toUtc, userId, ...extra });

  const totals = useMemo(() => sum(data.scoreboard), [data.scoreboard]);
  const prevTotals = useMemo(() => (data.previousScoreboard ? sum(data.previousScoreboard) : null), [data.previousScoreboard]);

  const targetFor = (userId: string | null, metric: TargetMetric): number | null => {
    const rows = data.targets.filter((t) => t.metric === metric && (userId ? t.user_id === userId : true));
    if (!rows.length) return null;
    return rows.reduce((s, t) => s + t.weekly_value, 0);
  };
  const paceFor = (weekly: number): number | null => {
    if (f.preset === "today") return now ? dayPaceMarker(dailyTarget(weekly), profile.timezone, now) : null;
    if (f.preset === "this_week") return weekPaceMarker(weekly, today);
    return null;
  };

  const delta = (key: keyof Totals, money = false) => {
    if (!prevTotals) return null;
    const d = Number(totals[key] ?? 0) - Number(prevTotals[key] ?? 0);
    const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
    return `${sign}${money ? formatMoney(Math.abs(d)) : formatNumber(Math.abs(d))} vs previous`;
  };

  const title = !isFounder ? "Your performance" : who ? `${possessive(firstName(who.full_name))} performance` : "Team performance";

  const summaryPace = (metric: TargetMetric, actual: number) => {
    const weekly = targetFor(f.person, metric);
    if (weekly === null) return null;
    const target = rangeTarget(weekly, f.from, f.to);
    return <PaceBar actual={actual} target={target} pace={paceFor(weekly)} compact />;
  };

  return (
    <>
      {isFounder && department === "all" && lists.socialAccounts.length > 0 && <PerformanceTabs active="sales" />}
      <PageHeader
        title={title}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <SelectField
                aria-label="Date range"
                value={f.preset}
                onChange={(v) => v && setParams({ range: v === "this_week" ? null : v, from: v === "custom" ? f.from : null, to: v === "custom" ? f.to : null })}
                options={PRESETS.map((p) => ({ value: p, label: RANGE_PRESET_LABELS[p] }))}
                className="h-8"
              />
            </div>
            {f.preset === "custom" && (
              <>
                <Input aria-label="From" type="date" className="h-8 w-36" value={f.from} onChange={(e) => setParams({ range: "custom", from: e.target.value, to: f.to })} />
                <Input aria-label="To" type="date" className="h-8 w-36" value={f.to} onChange={(e) => setParams({ range: "custom", from: f.from, to: e.target.value })} />
              </>
            )}
            {isFounder && (
              <div className="w-44">
                <SelectField
                  aria-label="Person"
                  value={f.person}
                  onChange={(v) => setParams({ person: v })}
                  noneLabel="All"
                  options={lists.salesMembers.map((m) => ({ value: m.id, label: m.full_name || m.email }))}
                  className="h-8"
                />
              </div>
            )}
            {isFounder && (
              <div className="flex items-center gap-2">
                <Switch id="compare" checked={f.compare} onCheckedChange={(v) => setParams({ compare: v ? "1" : null })} />
                <Label htmlFor="compare" className="text-body">
                  Compare to previous period
                </Label>
              </div>
            )}
          </div>
        }
      />

      {/* 1. Summary */}
      <StatGrid className="mb-6 lg:grid-cols-4" data-testid="summary">
        <StatBlock label="Leads added" value={formatNumber(totals.leads_added)} sub={delta("leads_added")} onClick={() => open("leads_added", "Leads added")}>
          {summaryPace("leads_added", totals.leads_added)}
        </StatBlock>
        <StatBlock label="Outreach" value={formatNumber(totals.outreach)} sub={delta("outreach")} onClick={() => open("outreach", "Outreach")}>
          {summaryPace("outreach", totals.outreach)}
        </StatBlock>
        <StatBlock
          label="Replies"
          value={formatNumber(totals.replies)}
          sub={
            <span title="Replies this period ÷ first messages this period.">
              Reply rate {formatRatio(replyRate(totals))}
              {delta("replies") && `, ${delta("replies")}`}
            </span>
          }
          onClick={() => open("replies", "Replies")}
        />
        <StatBlock label="Meetings booked" value={formatNumber(totals.meetings_booked)} sub={delta("meetings_booked")} onClick={() => open("meetings_booked", "Meetings booked")}>
          {summaryPace("meetings_booked", totals.meetings_booked)}
        </StatBlock>
        <StatBlock
          label="Proposals sent"
          value={formatNumber(totals.proposals_sent)}
          sub={
            <span title="Proposals sent this period ÷ meetings done this period.">
              Proposal rate {formatRatio(proposalRate(totals))}
              {delta("proposals_sent") && `, ${delta("proposals_sent")}`}
            </span>
          }
          onClick={() => open("proposals_sent", "Proposals sent")}
        >
          {summaryPace("proposals_sent", totals.proposals_sent)}
        </StatBlock>
        <StatBlock
          label="Won revenue"
          value={formatMoney(totals.won_revenue)}
          sub={`${formatNumber(totals.won_count)} ${totals.won_count === 1 ? "deal" : "deals"}, win rate ${formatRatio(winRate(totals.won_count, totals.lost_count))}`}
          onClick={() => open("won", "Won deals")}
        />
        <StatBlock label="New MRR" value={formatMoney(totals.new_mrr)} sub={delta("new_mrr", true)} onClick={() => open("won", "Won deals")} />
        <StatBlock label="Active MRR" value={formatMoney(data.activeMrr)} sub="Monthly contracts running now" />
      </StatGrid>

      {/* 2. Scoreboard */}
      {isFounder && !f.person && (
        <Scoreboard data={data} onDrill={open} onPerson={(id) => setParams({ person: id })} targetFor={targetFor} paceFor={paceFor} />
      )}

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        {/* 3. Funnel */}
        <Funnel totals={totals} onDrill={open} />
        {/* 7. Tasks */}
        <TasksBlock data={data} />
      </div>

      {/* 4. Breakdown */}
      <Breakdown data={data} onDrill={open} />

      {/* 5. Consistency grid */}
      <ConsistencyGrid data={data} />

      {/* 6. Pipeline health */}
      <PipelineHealth data={data} />

      <DrilldownSheet request={drill} onClose={() => setDrill(null)} />
    </>
  );
}

/** A clickable number. Its accessible name starts with the number shown, then says what it is. */
function NumButton({ value, label, onClick, className }: { value: string; label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("num rounded-sm px-1 hover:bg-accent-soft hover:text-accent-strong", className)}>
      <span data-value>{value}</span>
      <span className="sr-only">, {label}. Show the list</span>
    </button>
  );
}

type SortKey = keyof ScoreRow | "name";

function Scoreboard({
  data,
  onDrill,
  onPerson,
  targetFor,
  paceFor,
}: {
  data: PerformanceData;
  onDrill: (m: DrillMetric, label: string, userId?: string | null) => void;
  onPerson: (id: string) => void;
  targetFor: (userId: string | null, m: TargetMetric) => number | null;
  paceFor: (weekly: number) => number | null;
}) {
  const { lists } = useApp();
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "leads_added", dir: "desc" });
  const name = (id: string) => lists.members.find((m) => m.id === id)?.full_name ?? "";
  const rows = [...data.scoreboard].sort((a, b) => {
    const d = sort.dir === "asc" ? 1 : -1;
    if (sort.key === "name") return name(a.user_id).localeCompare(name(b.user_id)) * d;
    return (Number(a[sort.key] ?? -1) - Number(b[sort.key] ?? -1)) * d;
  });
  const cols: { key: SortKey; label: string; metric?: DrillMetric; target?: TargetMetric; money?: boolean; pct?: boolean }[] = [
    { key: "leads_added", label: "Leads added", metric: "leads_added", target: "leads_added" },
    { key: "outreach", label: "Outreach", metric: "outreach", target: "outreach" },
    { key: "follow_ups", label: "Follow-ups", metric: "follow_ups", target: "follow_ups" },
    { key: "replies", label: "Replies", metric: "replies", target: "replies" },
    { key: "positive_replies", label: "Positive", metric: "positive_replies" },
    { key: "meetings_booked", label: "Meetings booked", metric: "meetings_booked", target: "meetings_booked" },
    { key: "meetings_done", label: "Meetings done", metric: "meetings_done" },
    { key: "proposals_sent", label: "Proposals", metric: "proposals_sent", target: "proposals_sent" },
    { key: "won_count", label: "Won", metric: "won" },
    { key: "won_revenue", label: "Revenue", metric: "won", money: true },
    { key: "new_mrr", label: "New MRR", metric: "won", money: true },
    { key: "avg_completeness", label: "Avg complete", pct: true },
    { key: "flagged_leads", label: "Flagged", metric: "flagged" },
  ];
  const header = (key: SortKey, label: string, right = true) => (
    <th key={String(key)} scope="col" className={cn("h-9 px-2 text-small font-medium whitespace-nowrap text-ink-muted", right ? "text-right" : "text-left")} aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}>
        {label}
        {sort.key === key && (sort.dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
      </button>
    </th>
  );

  return (
    <Panel className="mb-6 overflow-hidden" aria-label="Scoreboard">
      <PanelHeader title="Scoreboard" meta="Click a person to see only their numbers" />
      <div className="overflow-x-auto">
        <table className="w-full text-body" data-testid="scoreboard">
          <thead className="bg-surface-muted">
            <tr className="border-b border-line">
              {header("name", "Person", false)}
              {cols.map((c) => header(c.key, c.label))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="border-b border-line align-top last:border-0" data-testid={`score-${name(r.user_id)}`}>
                <td className="px-2 py-2 font-medium whitespace-nowrap">
                  <button type="button" className="hover:underline" onClick={() => onPerson(r.user_id)}>
                    {name(r.user_id)}
                  </button>
                </td>
                {cols.map((c) => {
                  const v = r[c.key as keyof ScoreRow] as number | null;
                  const display = c.money ? formatMoney(v) : c.pct ? (v === null ? "–" : `${v}%`) : formatNumber(v ?? 0);
                  const weekly = c.target ? targetFor(r.user_id, c.target) : null;
                  const target = weekly !== null ? rangeTarget(weekly, data.filters.from, data.filters.to) : null;
                  return (
                    <td key={String(c.key)} className="num px-2 py-2 text-right" data-testid={`cell-${String(c.key)}`}>
                      {c.metric ? (
                        <NumButton value={display} label={`${name(r.user_id)}, ${c.label}`} onClick={() => onDrill(c.metric!, `${possessive(firstName(name(r.user_id)))} ${c.label.toLowerCase()}`, r.user_id)} />
                      ) : (
                        display
                      )}
                      {target !== null && weekly !== null && (
                        <div className="mt-1 ml-auto w-24">
                          <PaceBar actual={v ?? 0} target={target} pace={paceFor(weekly)} compact label={c.label} />
                          <div className="num mt-0.5 text-micro font-normal text-ink-muted">
                            of {formatNumber(target)}, {formatRatio(achievement(v ?? 0, target))}
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Funnel({ totals, onDrill }: { totals: Totals; onDrill: (m: DrillMetric, label: string) => void }) {
  const steps: { label: string; value: number; metric: DrillMetric }[] = [
    { label: "Leads added", value: totals.leads_added, metric: "leads_added" },
    { label: "Outreach", value: totals.outreach, metric: "outreach" },
    { label: "Replies", value: totals.replies, metric: "replies" },
    { label: "Meetings booked", value: totals.meetings_booked, metric: "meetings_booked" },
    { label: "Proposals sent", value: totals.proposals_sent, metric: "proposals_sent" },
    { label: "Won deals", value: totals.won_count, metric: "won" },
  ];
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <Panel aria-label="Funnel">
      <PanelHeader title="Funnel" meta="Activity funnel for the period, not a cohort" />
      <ol className="flex flex-col gap-2.5 p-4" data-testid="funnel">
        {steps.map((s, i) => {
          const prev = steps[i - 1];
          return (
            <li key={s.label} className="grid grid-cols-[120px_1fr_64px] items-center gap-3">
              <span className="text-small text-ink-muted">{s.label}</span>
              <button
                type="button"
                onClick={() => onDrill(s.metric, s.label)}
                className="group h-5 rounded-sm text-left"
              >
                <span className="sr-only">
                  {s.label}: {s.value}
                  {prev ? `, ${formatRatio(rate(s.value, prev.value))} of ${prev.label.toLowerCase()}` : ""}. Show the list
                </span>
                <span
                  className="block h-full rounded-r-[4px] bg-accent-strong transition-[width] duration-300 group-hover:bg-accent-hover"
                  style={{ width: `${Math.max(s.value ? 1.5 : 0, (s.value / max) * 100)}%` }}
                />
              </button>
              <span className="num text-right text-body text-ink">
                {formatNumber(s.value)}
                {prev && <span className="block text-micro font-normal text-ink-muted">{formatRatio(rate(s.value, prev.value))}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

function TasksBlock({ data }: { data: PerformanceData }) {
  const { lists } = useApp();
  const name = (id: string) => lists.members.find((m) => m.id === id)?.full_name ?? "";
  return (
    <Panel aria-label="Tasks">
      <PanelHeader title="Tasks" meta="Due in the period" />
      {data.tasks.length === 0 ? (
        <EmptyState>No tasks were due in this period.</EmptyState>
      ) : (
        <table className="w-full text-body" data-testid="task-stats">
          <thead>
            <tr className="border-b border-line text-small text-ink-muted">
              <th scope="col" className="h-9 px-4 text-left font-medium">Person</th>
              <th scope="col" className="px-2 text-right font-medium">Due</th>
              <th scope="col" className="px-2 text-right font-medium">On time</th>
              <th scope="col" className="px-2 text-right font-medium">Late</th>
              <th scope="col" className="px-2 text-right font-medium">Overdue</th>
              <th scope="col" className="px-4 text-right font-medium">Done</th>
            </tr>
          </thead>
          <tbody>
            {data.tasks.map((t) => (
              <tr key={t.user_id} className="border-b border-line last:border-0">
                <td className="px-4 py-2">{name(t.user_id)}</td>
                <td className="num px-2 text-right">{t.due}</td>
                <td className="num px-2 text-right">{t.on_time}</td>
                <td className="num px-2 text-right">{t.late}</td>
                <td className={cn("num px-2 text-right", t.overdue > 0 && "text-bad")}>{t.overdue}</td>
                <td className="num px-4 text-right">
                  {formatRatio(rate(t.on_time + t.late, t.due))}
                  {t.on_time + t.late > 0 && (
                    <span className="block text-micro font-normal text-ink-muted">{formatRatio(rate(t.on_time, t.on_time + t.late))} on time</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function Breakdown({ data, onDrill }: { data: PerformanceData; onDrill: (m: DrillMetric, label: string, userId?: string | null, extra?: Partial<DrillRequest>) => void }) {
  const [tab, setTab] = useState<"niche" | "channel" | "campaign">("niche");
  const rows: DimensionRow[] = tab === "niche" ? data.byNiche : tab === "channel" ? data.byChannel : data.byCampaign;
  const key = tab === "niche" ? "nicheId" : tab === "channel" ? "channelId" : "campaignId";
  const chart = rows
    .filter((r) => r.outreach > 0)
    .map((r) => ({ name: r.dimension_name, rate: (r.replies / r.outreach) * 100, replies: r.replies, outreach: r.outreach }));
  const drill = (m: DrillMetric, r: DimensionRow, label: string) => onDrill(m, `${label}: ${r.dimension_name}`, data.filters.person, { [key]: r.dimension_id });

  return (
    <Panel className="mb-6" aria-label="Breakdown">
      <PanelHeader
        title="Breakdown"
        actions={
          <div role="tablist" aria-label="Break down by" className="flex gap-1">
            {(["niche", "channel", "campaign"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn("h-7 rounded-md px-2.5 text-small", tab === t ? "bg-accent-soft font-medium text-accent-strong" : "text-ink-muted hover:bg-surface-muted")}
              >
                By {t}
              </button>
            ))}
          </div>
        }
      />
      {rows.length === 0 ? (
        <EmptyState>{tab === "campaign" ? "No campaigns yet. Add them in Settings." : "Nothing to break down yet."}</EmptyState>
      ) : (
        <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="overflow-x-auto">
            <table className="w-full text-body" data-testid="breakdown">
              <thead>
                <tr className="border-b border-line text-small text-ink-muted">
                  <th scope="col" className="h-9 pr-2 text-left font-medium capitalize">{tab}</th>
                  <th scope="col" className="px-2 text-right font-medium">Leads</th>
                  <th scope="col" className="px-2 text-right font-medium">Outreach</th>
                  <th scope="col" className="px-2 text-right font-medium">Replies</th>
                  <th scope="col" className="px-2 text-right font-medium" title="Replies this period ÷ first messages this period.">Reply rate</th>
                  <th scope="col" className="px-2 text-right font-medium" title="Positive replies ÷ first messages this period.">Positive</th>
                  <th scope="col" className="px-2 text-right font-medium" title="Meetings booked ÷ first messages this period.">Meeting rate</th>
                  <th scope="col" className="px-2 text-right font-medium">Proposals</th>
                  <th scope="col" className="pl-2 text-right font-medium">Won</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.dimension_id} className="border-b border-line last:border-0">
                    <td className="py-1.5 pr-2">{r.dimension_name}</td>
                    <td className="num px-2 text-right"><NumButton value={formatNumber(r.leads_added)} label={`Leads added, ${r.dimension_name}`} onClick={() => drill("leads_added", r, "Leads added")} /></td>
                    <td className="num px-2 text-right"><NumButton value={formatNumber(r.outreach)} label={`Outreach, ${r.dimension_name}`} onClick={() => drill("outreach", r, "Outreach")} /></td>
                    <td className="num px-2 text-right"><NumButton value={formatNumber(r.replies)} label={`Replies, ${r.dimension_name}`} onClick={() => drill("replies", r, "Replies")} /></td>
                    <td className="num px-2 text-right">{formatRatio(replyRate(r))}</td>
                    <td className="num px-2 text-right">{formatRatio(positiveReplyRate(r))}</td>
                    <td className="num px-2 text-right">{formatRatio(meetingRate(r))}</td>
                    <td className="num px-2 text-right"><NumButton value={formatNumber(r.proposals_sent)} label={`Proposals, ${r.dimension_name}`} onClick={() => drill("proposals_sent", r, "Proposals sent")} /></td>
                    <td className="num pl-2 text-right">
                      <NumButton value={formatNumber(r.won_count)} label={`Won deals, ${r.dimension_name}`} onClick={() => drill("won", r, "Won deals")} />
                      <span className="block text-micro font-normal text-ink-muted">{formatMoney(r.won_revenue)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <figure aria-label={`Reply rate by ${tab}`}>
            <figcaption className="mb-2 text-small text-ink-muted">Reply rate by {tab}</figcaption>
            {chart.length === 0 ? (
              <p className="text-small text-ink-muted">No outreach in this period, so there&apos;s no reply rate to chart.</p>
            ) : (
              <div style={{ height: Math.max(120, chart.length * 32 + 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }} barCategoryGap={6}>
                    <CartesianGrid horizontal={false} stroke="var(--line)" />
                    <XAxis type="number" tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 12, fill: "var(--ink-muted)" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12, fill: "var(--ink)" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: "var(--surface-muted)" }}
                      formatter={(_v, _n, item) => {
                        const p = item.payload as { rate: number; replies: number; outreach: number };
                        return [`${formatRatio(p.rate / 100)} (${p.replies} of ${p.outreach})`, "Reply rate"];
                      }}
                      contentStyle={{ background: "var(--surface)", color: "var(--ink)", borderRadius: 10, border: "1px solid var(--line)", boxShadow: "var(--shadow-overlay)", fontSize: 13 }}
                    />
                    <Bar dataKey="rate" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                      {chart.map((c) => (
                        <Cell key={c.name} fill="var(--accent)" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </figure>
        </div>
      )}
    </Panel>
  );
}

const GRID_METRICS = ["leads_added", "outreach", "follow_ups", "replies", "meetings_booked"] as const;
type GridMetric = (typeof GRID_METRICS)[number];
const SHADE: Record<ReturnType<typeof gridShade>, string> = {
  empty: "bg-surface text-ink-muted",
  light: "bg-heat-light text-ink",
  medium: "bg-heat-medium text-ink",
  full: "bg-accent-strong text-on-accent",
};

function ConsistencyGrid({ data }: { data: PerformanceData }) {
  const { lists } = useApp();
  const [metric, setMetric] = useState<GridMetric>("leads_added");
  const days = eachDay(data.gridClipped ? (data.daily[0]?.day ?? data.filters.from) : data.filters.from, data.filters.to).slice(-31);
  const people = [...new Set(data.daily.map((d) => d.user_id))];
  const name = (id: string) => lists.members.find((m) => m.id === id)?.full_name ?? "";
  const value = (u: string, d: string) => data.daily.find((x) => x.user_id === u && x.day === d)?.[metric] ?? 0;
  const daily = (u: string) => {
    const w = data.targets.find((t) => t.user_id === u && t.metric === metric)?.weekly_value;
    return w === undefined ? 0 : dailyTarget(w);
  };
  return (
    <Panel className="mb-6" aria-label="Consistency">
      <PanelHeader
        title="Consistency"
        meta={data.gridClipped ? "Last 31 days of the range" : "Shade compares each day with the daily target"}
        actions={
          <div className="w-44">
            <SelectField aria-label="Grid metric" value={metric} onChange={(v) => v && setMetric(v as GridMetric)} options={GRID_METRICS.map((m) => ({ value: m, label: METRIC_LABELS[m] }))} className="h-8" />
          </div>
        }
      />
      {people.length === 0 ? (
        <EmptyState>No one to show for this period.</EmptyState>
      ) : (
        <div className="overflow-x-auto p-4">
          <table className="border-separate border-spacing-0.5" data-testid="consistency">
            <thead>
              <tr>
                <th scope="col" className="sr-only">Person</th>
                {days.map((d) => (
                  <th key={d} scope="col" className={cn("text-micro font-normal text-ink-muted", isWeekend(d) ? "w-4" : "w-9")}>
                    <span className="block">{weekdayShort(d).slice(0, isWeekend(d) ? 1 : 2)}</span>
                    <span className="num block">{Number(d.slice(8))}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((u) => (
                <tr key={u}>
                  <th scope="row" className="pr-3 text-left text-small font-medium whitespace-nowrap text-ink">
                    {name(u)}
                  </th>
                  {days.map((d) => {
                    const v = value(u, d);
                    const shade = gridShade(v, daily(u));
                    const weekend = isWeekend(d);
                    return (
                      <td
                        key={d}
                        title={`${name(u)}, ${d}: ${v} ${METRIC_LABELS[metric].toLowerCase()}${daily(u) ? ` (daily target ${daily(u)})` : ""}`}
                        className={cn(
                          "num h-8 rounded-sm border border-line text-center text-micro",
                          weekend ? "w-4 bg-surface-muted text-ink-muted" : cn("w-9", SHADE[shade]),
                        )}
                      >
                        {v > 0 ? v : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-micro font-normal text-ink-muted" aria-hidden>
            <span className="flex items-center gap-1"><span className="size-3 rounded-sm border border-line bg-surface" /> 0</span>
            <span className="flex items-center gap-1"><span className="size-3 rounded-sm bg-heat-light" /> Under 50% of daily target</span>
            <span className="flex items-center gap-1"><span className="size-3 rounded-sm bg-heat-medium" /> 50–99%</span>
            <span className="flex items-center gap-1"><span className="size-3 rounded-sm bg-accent-strong" /> Target met</span>
          </div>
        </div>
      )}
    </Panel>
  );
}

function PipelineHealth({ data }: { data: PerformanceData }) {
  const { lists } = useApp();
  const { timezone } = useProfile();
  const today = todayIn(timezone);
  const name = (id: string) => lists.members.find((m) => m.id === id)?.full_name ?? "";
  const open = data.pipeline.filter((p) => !["won", "lost"].includes(p.stage_key));
  return (
    <Panel aria-label="Pipeline health">
      <PanelHeader title="Pipeline health" meta={<span className="num">Active MRR {formatMoney(data.activeMrr)}</span>} />
      <div className="grid gap-6 p-4 lg:grid-cols-2">
        <table className="w-full text-body" data-testid="pipeline-health">
          <thead>
            <tr className="border-b border-line text-small text-ink-muted">
              <th scope="col" className="h-9 text-left font-medium">Stage</th>
              <th scope="col" className="text-right font-medium">Count</th>
              <th scope="col" className="text-right font-medium">Value</th>
              <th scope="col" className="text-right font-medium">Weighted</th>
            </tr>
          </thead>
          <tbody>
            {data.pipeline.map((p) => (
              <tr key={p.stage_key} className="border-b border-line last:border-0">
                <td className="py-1.5"><StageChip stage={p.stage_key} label={p.stage_label} /></td>
                <td className="num text-right">{p.opp_count}</td>
                <td className="num text-right">{formatMoney(p.total_value)}</td>
                <td className="num text-right text-ink-muted">{["won", "lost"].includes(p.stage_key) ? "" : formatMoney(p.weighted_value)}</td>
              </tr>
            ))}
            <tr className="font-medium">
              <td className="pt-2">Open pipeline</td>
              <td className="num pt-2 text-right">{open.reduce((s, p) => s + p.opp_count, 0)}</td>
              <td className="num pt-2 text-right">{formatMoney(open.reduce((s, p) => s + p.total_value, 0))}</td>
              <td className="num pt-2 text-right">{formatMoney(open.reduce((s, p) => s + p.weighted_value, 0))}</td>
            </tr>
          </tbody>
        </table>
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-section text-ink">
            <Clock className="size-4 text-warn" aria-hidden /> Stuck deals
            <span className="num text-small font-normal text-ink-muted">{data.stuck.length}</span>
          </h3>
          {data.stuck.length === 0 ? (
            <p className="text-small text-ink-muted">Nothing has sat in one stage for 14 days or more.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {data.stuck.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-body">
                  <Link href={`/leads/${s.leadId}`} className="min-w-0 flex-1 truncate hover:underline">
                    {s.company}: {s.title}
                  </Link>
                  <StageChip stage={s.stage} label={lists.stages.find((x) => x.key === s.stage)?.label ?? s.stage} />
                  <span className="num w-12 text-right text-small text-warn">
                    {Math.max(0, Math.round((Date.parse(today) - Date.parse(s.since.slice(0, 10))) / 86_400_000))}d
                  </span>
                  <span className="w-24 truncate text-small text-ink-muted">{name(s.ownerId)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}
