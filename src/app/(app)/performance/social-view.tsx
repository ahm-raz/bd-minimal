"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, Panel, PanelHeader, StatBlock, StatGrid } from "@/components/common/page";
import { PaceBar } from "@/components/common/pace-bar";
import { SelectField } from "@/components/common/select-field";
import { Chip } from "@/components/common/chips";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { PlatformChip, PostStatusChip } from "@/components/content/post-status-chip";
import { RANGE_PRESET_LABELS, eachDay, formatDayTime, isWeekend, todayIn, weekdayShort, type DateRange, type RangePreset } from "@/lib/dates";
import { firstName, formatNumber, formatRatio, possessive } from "@/lib/format";
import { gridShade, rangeTarget, weekPaceMarker } from "@/lib/metrics";
import { isLate } from "@/lib/social";
import type { PerformanceFilters } from "@/server/queries/performance";
import type { SocialDimensionRow, SocialPerformance, SocialRow } from "@/server/queries/social-metrics";
import { PerformanceTabs } from "./performance-tabs";

const PRESETS: RangePreset[] = ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "last_7_days", "last_30_days", "custom"];

const SHADE: Record<ReturnType<typeof gridShade>, string> = {
  empty: "bg-surface text-ink-muted",
  light: "bg-heat-light text-ink",
  medium: "bg-heat-medium text-ink",
  full: "bg-accent-strong text-on-accent",
};

type Drill = "all" | "on_time" | "late" | "missed";

function sum(rows: SocialRow[]) {
  const t = { planned: 0, posted: 0, on_time: 0, late: 0, missed: 0, changes_requested: 0, impressions: 0, reactions: 0, comments: 0, shares: 0, clicks: 0 };
  for (const r of rows) for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += r[k];
  return t;
}

/** Performance → Social (docs/09 sections 4 and 5). */
export function SocialPerformanceView({ data, filters: f, range }: { data: SocialPerformance; filters: PerformanceFilters; range: DateRange }) {
  const { lists, department } = useApp();
  const profile = useProfile();
  const isFounder = profile.role === "founder";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [drill, setDrill] = useState<Drill>("all");
  const member = (id: string) => lists.members.find((m) => m.id === id);
  const who = f.person ? member(f.person) : null;
  const today = todayIn(profile.timezone);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const totals = sum(data.rows);
  const single = data.rows.length === 1 ? data.rows[0]! : null;
  const weekly = data.targets
    .filter((t) => (f.person ? t.user_id === f.person : data.rows.some((r) => r.user_id === t.user_id)))
    .reduce((s, t) => s + t.weekly_value, 0);
  const target = weekly ? rangeTarget(weekly, f.from, f.to) : null;
  const title = !isFounder ? "Your social numbers" : who ? `${possessive(firstName(who.full_name))} social numbers` : "Social performance";
  const showDrill = (d: Drill) => {
    setDrill(d);
    document.getElementById("social-posts")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {isFounder && department === "all" && <PerformanceTabs active="social" />}
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
                  options={lists.members.filter((m) => m.role === "social").map((m) => ({ value: m.id, label: m.full_name || m.email }))}
                  className="h-8"
                />
              </div>
            )}
          </div>
        }
      />

      <StatGrid className="mb-6 lg:grid-cols-4" data-testid="social-summary">
        <StatBlock label="Planned" value={formatNumber(totals.planned)} sub="Scheduled in this period" onClick={() => showDrill("all")} />
        <StatBlock
          label="Posted"
          value={formatNumber(totals.posted)}
          sub={target !== null ? `Target ${formatNumber(target)}` : undefined}
          onClick={() => showDrill("all")}
        >
          {target !== null && (
            <PaceBar actual={totals.posted} target={target} pace={f.preset === "this_week" ? weekPaceMarker(weekly, today) : null} compact />
          )}
        </StatBlock>
        <StatBlock
          label="On time"
          value={formatNumber(totals.on_time)}
          sub={<span title="Posted within 60 minutes of the post time ÷ posted.">On-time rate {formatRatio(totals.posted ? totals.on_time / totals.posted : null)}</span>}
          onClick={() => showDrill("on_time")}
        />
        <StatBlock label="Late" value={formatNumber(totals.late)} sub="More than 60 minutes after" onClick={() => showDrill("late")} />
        <StatBlock label="Missed" value={formatNumber(totals.missed)} sub="Not posted within 2 hours" onClick={() => showDrill("missed")} />
        <StatBlock label="Changes requested" value={formatNumber(totals.changes_requested)} sub="Review rounds sent back" />
        <StatBlock
          label="Median approval time"
          value={single?.median_approval_hours !== null && single?.median_approval_hours !== undefined ? `${formatNumber(single.median_approval_hours)}h` : "–"}
          sub={single ? "First submit to approval" : "Pick one person to see it"}
        />
        <StatBlock
          label="Reactions"
          value={formatNumber(totals.reactions)}
          sub={`${formatNumber(totals.impressions)} impressions, ${formatNumber(totals.comments)} comments, ${formatNumber(totals.clicks)} clicks`}
        />
      </StatGrid>

      {isFounder && !f.person && data.rows.length > 0 && <PeopleTable rows={data.rows} onPerson={(id) => setParams({ person: id })} />}

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <DimensionTable title="By account" rows={data.byAccount} />
        <DimensionTable title="By pillar" rows={data.byPillar} />
      </div>

      <PostedGrid data={data} to={f.to} />

      <PostsList posts={data.posts} drill={drill} setDrill={setDrill} range={range} />
    </>
  );
}

function PeopleTable({ rows, onPerson }: { rows: SocialRow[]; onPerson: (id: string) => void }) {
  const { lists } = useApp();
  return (
    <Panel className="mb-6 overflow-hidden" aria-label="People">
      <PanelHeader title="People" />
      <div className="overflow-x-auto">
        <table className="w-full text-body" data-testid="social-people">
          <thead className="bg-surface-muted">
            <tr className="border-b border-line text-small text-ink-muted">
              {["Person", "Planned", "Posted", "On-time rate", "Missed", "Changes requested", "Median approval"].map((h, i) => (
                <th key={h} scope="col" className={cn("h-9 px-3 font-medium whitespace-nowrap", i === 0 ? "text-left" : "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="h-10 border-b border-line last:border-0">
                <td className="px-3">
                  <button type="button" className="font-medium text-ink hover:underline" onClick={() => onPerson(r.user_id)}>
                    {lists.members.find((m) => m.id === r.user_id)?.full_name}
                  </button>
                </td>
                <td className="num px-3 text-right">{formatNumber(r.planned)}</td>
                <td className="num px-3 text-right">{formatNumber(r.posted)}</td>
                <td className="num px-3 text-right">{formatRatio(r.on_time_rate)}</td>
                <td className={cn("num px-3 text-right", r.missed > 0 && "text-bad")}>{formatNumber(r.missed)}</td>
                <td className="num px-3 text-right">{formatNumber(r.changes_requested)}</td>
                <td className="num px-3 text-right">{r.median_approval_hours === null ? "–" : `${formatNumber(r.median_approval_hours)}h`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function DimensionTable({ title, rows }: { title: string; rows: SocialDimensionRow[] }) {
  const shown = rows.filter((r) => r.planned > 0 || r.posted > 0);
  return (
    <Panel className="overflow-hidden" aria-label={title}>
      <PanelHeader title={title} />
      {shown.length === 0 ? (
        <EmptyState>No posts in this period.</EmptyState>
      ) : (
        <table className="w-full text-body" data-testid={`social-${title.toLowerCase().replace(/\s+/g, "-")}`}>
          <thead className="bg-surface-muted">
            <tr className="border-b border-line text-small text-ink-muted">
              {["Name", "Planned", "Posted", "Missed", "Avg reactions"].map((h, i) => (
                <th key={h} scope="col" className={cn("h-9 px-3 font-medium whitespace-nowrap", i === 0 ? "text-left" : "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.dimension_id} className="h-10 border-b border-line last:border-0">
                <td className="px-3">{r.dimension_name}</td>
                <td className="num px-3 text-right">{formatNumber(r.planned)}</td>
                <td className="num px-3 text-right">{formatNumber(r.posted)}</td>
                <td className={cn("num px-3 text-right", r.missed > 0 && "text-bad")}>{formatNumber(r.missed)}</td>
                <td className="num px-3 text-right" title="Average reactions per post with results recorded">
                  {r.avg_reactions === null ? "–" : formatNumber(r.avg_reactions)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function PostedGrid({ data, to }: { data: SocialPerformance; to: string }) {
  const { lists } = useApp();
  const days = eachDay(data.gridFrom, to);
  const people = [...new Set(data.daily.map((d) => d.user_id))];
  const name = (id: string) => lists.members.find((m) => m.id === id)?.full_name ?? "";
  const cell = (u: string, d: string) => data.daily.find((x) => x.user_id === u && x.day === d);
  return (
    <Panel className="mb-6" aria-label="Posted per day">
      <PanelHeader title="Posted per day" meta="Shade compares posts that went out with the posts scheduled that day" />
      {people.length === 0 ? (
        <EmptyState>No one to show for this period.</EmptyState>
      ) : (
        <div className="overflow-x-auto p-4">
          <table className="border-separate border-spacing-0.5" data-testid="social-grid">
            <thead>
              <tr>
                <th scope="col" className="sr-only">
                  Person
                </th>
                {days.map((d) => (
                  <th key={d} scope="col" className="w-9 text-micro font-normal text-ink-muted">
                    <span className="block">{weekdayShort(d).slice(0, 2)}</span>
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
                    const c = cell(u, d);
                    const posted = c?.posted ?? 0;
                    const scheduled = c?.scheduled ?? 0;
                    const missed = c?.missed ?? 0;
                    const shade = scheduled ? gridShade(posted, scheduled) : posted ? "full" : "empty";
                    return (
                      <td
                        key={d}
                        title={`${name(u)}, ${d}: ${posted} posted, ${scheduled} scheduled${missed ? `, ${missed} missed` : ""}`}
                        className={cn(
                          "num h-8 w-9 rounded-sm border text-center text-micro",
                          missed ? "border-bad" : "border-line",
                          !scheduled && !posted && isWeekend(d) ? "bg-surface-muted text-ink-muted" : SHADE[shade],
                        )}
                      >
                        {posted > 0 || scheduled > 0 ? `${posted}/${scheduled}` : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-micro font-normal text-ink-muted">Posted / scheduled. A red border means a post was missed that day.</p>
        </div>
      )}
    </Panel>
  );
}

const DRILLS: { key: Drill; label: string }[] = [
  { key: "all", label: "All" },
  { key: "on_time", label: "On time" },
  { key: "late", label: "Late" },
  { key: "missed", label: "Missed" },
];

function PostsList({ posts, drill, setDrill, range }: { posts: SocialPerformance["posts"]; drill: Drill; setDrill: (d: Drill) => void; range: DateRange }) {
  const { lists, openPostSheet } = useApp();
  const { timezone } = useProfile();
  const shown = posts.filter((p) => {
    if (drill === "missed") return p.status === "missed";
    if (p.status !== "posted" && drill !== "all") return false;
    if (drill === "late") return !!p.postedAt && !!p.scheduledAt && isLate(p.scheduledAt, p.postedAt);
    if (drill === "on_time") return !!p.postedAt && !!p.scheduledAt && !isLate(p.scheduledAt, p.postedAt);
    return true;
  });
  return (
    <Panel className="mb-6 scroll-mt-4 overflow-hidden" id="social-posts" aria-label="Posts">
      <PanelHeader
        title="Posts"
        meta={`${range.fromDate} to ${range.toDate}`}
        actions={
          <div className="inline-flex rounded-md border border-line p-0.5" role="group" aria-label="Show">
            {DRILLS.map((d) => (
              <button
                key={d.key}
                type="button"
                aria-pressed={drill === d.key}
                onClick={() => setDrill(d.key)}
                className={cn("h-7 rounded px-2.5 text-small", drill === d.key ? "bg-accent-soft font-medium text-accent-strong" : "text-ink-muted hover:text-ink")}
              >
                {d.label}
              </button>
            ))}
          </div>
        }
      />
      {shown.length === 0 ? (
        <EmptyState>No posts to show.</EmptyState>
      ) : (
        <ul className="divide-y divide-line" data-testid="social-posts">
          {shown.map((p) => {
            const a = lists.socialAccounts.find((x) => x.id === p.accountId);
            const late = p.status === "posted" && p.postedAt && p.scheduledAt && isLate(p.scheduledAt, p.postedAt);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                {a && <PlatformChip platform={a.platform} />}
                <button type="button" className="min-w-0 flex-1 truncate text-left text-ink hover:underline" onClick={() => openPostSheet({ mode: "open", id: p.id })}>
                  {p.title}
                </button>
                <span className="num text-small text-ink-muted">{p.scheduledAt && formatDayTime(p.scheduledAt, timezone)}</span>
                {late && <Chip tone="warn">Late</Chip>}
                <PostStatusChip status={p.status} />
                {p.reactions !== null && <span className="num w-24 text-right text-small text-ink-muted">{formatNumber(p.reactions)} reactions</span>}
                {p.postUrl && (
                  <a href={p.postUrl} target="_blank" rel="noreferrer" className="text-ink-muted hover:text-ink" aria-label={`Open the live post: ${p.title}`}>
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

