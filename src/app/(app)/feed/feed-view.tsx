"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUp, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { RelativeTime } from "@/components/common/relative-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page";
import { SelectField } from "@/components/common/select-field";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { FlagLeadDialog } from "@/components/leads/flag-dialog";
import { createClient } from "@/lib/supabase/browser";
import { RANGE_PRESET_LABELS, type RangePreset } from "@/lib/dates";
import { FEED_GROUPS, effectiveFeedGroups, feedGroupsFor, kindsFor, type FeedEvent, type FeedGroup } from "@/lib/feed";
import { inDepartment } from "@/lib/department";
import { firstName, initials } from "@/lib/format";
import { loadFeed } from "@/server/actions/feed";

type Filters = { preset: RangePreset; from: string; to: string; person: string | null; groups: FeedGroup[] };

const PRESETS: RangePreset[] = ["today", "yesterday", "this_week", "last_week", "last_7_days", "this_month", "custom"];

function toEvent(row: Record<string, unknown>): FeedEvent {
  return {
    id: Number(row.id),
    kind: String(row.kind),
    actorId: (row.actor_id as string | null) ?? null,
    subjectUserId: (row.subject_user_id as string | null) ?? null,
    leadId: (row.lead_id as string | null) ?? null,
    opportunityId: (row.opportunity_id as string | null) ?? null,
    taskId: (row.task_id as string | null) ?? null,
    postId: (row.post_id as string | null) ?? null,
    summary: String(row.summary),
    createdAt: String(row.created_at),
  };
}

/** Live feed (docs/07 section 9): Realtime inserts, filters, "N new" pill, infinite scroll, hover actions. */
export function FeedView({
  initial,
  error,
  filters,
  range,
}: {
  initial: FeedEvent[];
  error: string | null;
  filters: Filters;
  range: { fromUtc: string; toUtc: string };
}) {
  const { lists, department } = useApp();
  // The founder's department view narrows which events load and which chips show.
  const loadGroups = useMemo(() => effectiveFeedGroups(filters.groups, department), [filters.groups, department]);
  const { timezone } = useProfile();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [events, setEvents] = useState(initial);
  const [pending, setPending] = useState<FeedEvent[]>([]);
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set());
  const [done, setDone] = useState(initial.length < 50);
  const [loadingMore, setLoadingMore] = useState(false);
  const [flagging, setFlagging] = useState<FeedEvent | null>(null);
  const [live, setLive] = useState(false);
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setEvents(initial);
    setPending([]);
    setDone(initial.length < 50);
  }
  const sentinel = useRef<HTMLDivElement>(null);
  const member = (id: string | null) => lists.members.find((m) => m.id === id);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  // Realtime: new events within ~2 seconds, no refresh (RLS: only the founder receives rows).
  const filtersRef = useRef({ filters, range, loadGroups });
  useEffect(() => {
    filtersRef.current = { filters, range, loadGroups };
  }, [filters, range, loadGroups]);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    void (async () => {
      // The Realtime socket must carry the user's token, or RLS treats it as anonymous and sends nothing.
      const { data } = await supabase.auth.getSession();
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (cancelled) return;
      channel = supabase
        .channel("feed-events")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "feed_events" }, (payload) => {
          const e = toEvent(payload.new as Record<string, unknown>);
          const { filters: f, range: r, loadGroups: g } = filtersRef.current;
          if (e.createdAt < r.fromUtc || e.createdAt >= r.toUtc) return;
          if (f.person && e.subjectUserId !== f.person && e.actorId !== f.person) return;
          if (g.length && !kindsFor(g).includes(e.kind)) return;
          if (window.scrollY > 160) {
            setPending((p) => (p.some((x) => x.id === e.id) ? p : [e, ...p]));
          } else {
            setEvents((list) => (list.some((x) => x.id === e.id) ? list : [e, ...list]));
            setFreshIds((s) => new Set(s).add(e.id));
          }
        })
        // Postgres changes are flowing only once Realtime says so on the system channel.
        .on("system", {}, (msg: { extension?: string; status?: string }) => {
          if (msg.extension === "postgres_changes") setLive(msg.status === "ok");
        })
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") setLive(false);
        });
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const showPending = () => {
    setEvents((list) => [...pending.filter((p) => !list.some((x) => x.id === p.id)), ...list]);
    setFreshIds(new Set(pending.map((p) => p.id)));
    setPending([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const loadMore = useCallback(async () => {
    if (done || loadingMore || events.length === 0) return;
    setLoadingMore(true);
    const res = await loadFeed({
      fromUtc: range.fromUtc,
      toUtc: range.toUtc,
      person: filters.person,
      groups: loadGroups,
      beforeId: events[events.length - 1]!.id,
    });
    setLoadingMore(false);
    if (!res.ok) return;
    setEvents((list) => [...list, ...res.data.filter((e) => !list.some((x) => x.id === e.id))]);
    if (res.data.length < 50) setDone(true);
  }, [done, loadingMore, events, range, filters, loadGroups]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), {
      rootMargin: "400px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  const toggleGroup = (g: FeedGroup) => {
    const next = filters.groups.includes(g) ? filters.groups.filter((x) => x !== g) : [...filters.groups, g];
    setParams({ types: next.join(",") || null });
  };

  return (
    <>
      <PageHeader
        title="Feed"
        meta={
          <span
            className="inline-flex items-center gap-1.5"
            data-testid="feed-status"
            data-live={live ? "1" : "0"}
            aria-live="polite"
          >
            <span className={cn("size-2 rounded-full", live ? "bg-ok" : "bg-ink-faint")} aria-hidden />
            {live ? "Live" : "Connecting"}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <div className="w-40">
              <SelectField
                aria-label="Date range"
                value={filters.preset}
                onChange={(v) => v && setParams({ range: v === "today" ? null : v, from: null, to: null })}
                options={PRESETS.map((p) => ({ value: p, label: RANGE_PRESET_LABELS[p] }))}
                className="h-8"
              />
            </div>
            {filters.preset === "custom" && (
              <>
                <Input
                  aria-label="From"
                  type="date"
                  className="h-8 w-36"
                  value={filters.from}
                  onChange={(e) => setParams({ from: e.target.value, to: filters.to })}
                />
                <Input
                  aria-label="To"
                  type="date"
                  className="h-8 w-36"
                  value={filters.to}
                  onChange={(e) => setParams({ to: e.target.value, from: filters.from })}
                />
              </>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-48">
          <SelectField
            aria-label="Person"
            value={filters.person}
            onChange={(v) => setParams({ person: v })}
            noneLabel="Everyone"
            options={lists.members
              .filter((m) => inDepartment(m.role, department))
              .map((m) => ({ value: m.id, label: m.full_name || m.email }))}
            className="h-8"
          />
        </div>
        <div role="group" aria-label="Event types" className="flex flex-wrap gap-1.5">
          {feedGroupsFor(department).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={filters.groups.includes(g)}
              onClick={() => toggleGroup(g)}
              className={cn(
                "h-7 rounded-md border px-2.5 text-small",
                filters.groups.includes(g)
                  ? "border-accent-strong bg-accent-soft text-accent-strong"
                  : "border-line bg-surface text-ink hover:bg-surface-muted",
              )}
            >
              {FEED_GROUPS[g].label}
            </button>
          ))}
        </div>
      </div>

      {pending.length > 0 && (
        <div className="sticky top-3 z-20 flex justify-center">
          <Button onClick={showPending} className="shadow-overlay" data-testid="new-pill">
            <ArrowUp aria-hidden /> {pending.length} new
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface">
        {error ? (
          <ErrorState>{error}</ErrorState>
        ) : events.length === 0 ? (
          <EmptyState>Nothing yet for these filters. New activity appears here as it happens.</EmptyState>
        ) : (
          <ol className="divide-y divide-line" data-testid="feed">
            {events.map((e) => {
              const actor = member(e.actorId) ?? member(e.subjectUserId);
              const name = firstName(actor?.full_name) || "Someone";
              return (
                <li
                  key={e.id}
                  data-testid="feed-row"
                  className={cn(
                    "group flex items-center gap-3 px-4 py-2.5 focus-within:bg-surface-muted hover:bg-surface-muted",
                    freshIds.has(e.id) && "animate-in duration-500 fade-in",
                  )}
                >
                  <RelativeTime
                    at={e.createdAt}
                    tz={timezone}
                    className="w-28 shrink-0 num text-small text-ink-muted"
                  />
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-micro text-accent-strong"
                    aria-hidden
                  >
                    {initials(actor?.full_name)}
                  </span>
                  <span className="min-w-0 flex-1 text-body text-ink">
                    <span className="font-medium">{name}</span> {e.summary}
                    {e.kind === "lead_flagged" && (
                      <Flag className="ml-1.5 inline size-3.5 text-bad" aria-label="Flag" />
                    )}
                  </span>
                  {e.leadId && (
                    <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/leads/${e.leadId}`}>Open</Link>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setFlagging(e)}>
                        Flag lead
                      </Button>
                    </span>
                  )}
                  {e.postId && (
                    <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/content?post=${e.postId}`}>Open</Link>
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <div ref={sentinel} aria-hidden />
        {loadingMore && <p className="px-4 py-3 text-small text-ink-muted">Loading more…</p>}
      </div>

      {flagging?.leadId && (
        <FlagLeadDialog
          leadId={flagging.leadId}
          companyName={flagging.company ?? "this lead"}
          ownerName={firstName(member(flagging.subjectUserId)?.full_name) || "The owner"}
          onClose={() => setFlagging(null)}
        />
      )}
    </>
  );
}
