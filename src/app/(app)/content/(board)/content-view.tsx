"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ArrowDown, ArrowUp, CalendarClock, ChevronLeft, ChevronRight, Lightbulb, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, Panel, PanelHeader } from "@/components/common/page";
import { SelectField } from "@/components/common/select-field";
import { RelativeTime } from "@/components/common/relative-time";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { CARD_CLASS, PostCard, PostCardBody } from "@/components/content/post-card";
import { PlatformChip, PostStatusChip } from "@/components/content/post-status-chip";
import {
  addDays,
  diffDays,
  eachDay,
  formatDayTime,
  formatLocalDate,
  localDateOf,
  startOfMonth,
  weekdayShort,
} from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { POST_STATUSES, POST_STATUS_DOT, POST_STATUS_LABELS, type PostStatus } from "@/lib/social";
import { reschedulePost } from "@/server/actions/content";
import type { ContentFilters, PostItem } from "@/server/queries/content";

export type ContentViewMode = "week" | "month" | "list" | "review";

/** Statuses the founder can still move to another day by dragging. */
const MOVABLE: PostStatus[] = ["planned", "drafting", "in_review", "changes_requested", "approved"];

export function ContentView({
  view,
  anchor,
  today,
  range,
  filters,
  posts,
  ideas,
  review,
  openPostId,
  openNew,
  openIdea,
}: {
  view: ContentViewMode;
  anchor: string;
  today: string;
  range: { from: string; to: string };
  filters: ContentFilters;
  posts: PostItem[];
  ideas: PostItem[];
  review: PostItem[];
  openPostId: string | null;
  openNew: boolean;
  openIdea: boolean;
}) {
  const { lists, openPostSheet } = useApp();
  const profile = useProfile();
  const founder = profile.role === "founder";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  // ?post= (from the feed or My Day), ?new=1 and ?idea=1 (command menu) open the side panel once.
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    if (!openPostId && !openNew && !openIdea) return;
    handled.current = true;
    if (openPostId) openPostSheet({ mode: "open", id: openPostId });
    else if (openNew && founder) openPostSheet({ mode: "new" });
    else if (openIdea && !founder) openPostSheet({ mode: "idea" });
    const next = new URLSearchParams(params.toString());
    next.delete("post");
    next.delete("new");
    next.delete("idea");
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [openPostId, openNew, openIdea, founder, openPostSheet, params, pathname, router]);

  const open = (id: string) => openPostSheet({ mode: "open", id });
  const step = view === "week" ? 7 : 0;
  const shiftAnchor = (dir: -1 | 1) => {
    if (step) return setParams({ date: addDays(anchor, dir * step) });
    const first = startOfMonth(anchor);
    const target = dir === 1 ? addDays(first, 32) : addDays(first, -1);
    setParams({ date: startOfMonth(target) });
  };

  const rangeLabel =
    view === "week"
      ? `${formatLocalDate(range.from, today)} to ${formatLocalDate(range.to, today)}`
      : new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
          new Date(`${startOfMonth(anchor)}T00:00:00Z`),
        );

  const tabs: { key: ContentViewMode; label: string }[] = [
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
    { key: "list", label: "List" },
    ...(founder ? [{ key: "review" as const, label: `Needs review (${review.length})` }] : []),
  ];

  const socialMembers = lists.members.filter((m) => m.role !== "bd");

  return (
    <>
      <PageHeader
        title="Content"
        meta={founder ? "Every account" : "Your posts"}
        actions={
          founder ? (
            <>
              <Button variant="secondary" asChild>
                <Link href="/content/schedules">
                  <CalendarClock aria-hidden /> Schedules
                </Link>
              </Button>
              <Button onClick={() => openPostSheet({ mode: "new" })}>
                <Plus aria-hidden /> New post
              </Button>
            </>
          ) : (
            <Button onClick={() => openPostSheet({ mode: "idea" })}>
              <Lightbulb aria-hidden /> Suggest an idea
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="Content views" className="inline-flex rounded-md border border-line bg-surface p-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-current={view === t.key ? "page" : undefined}
              onClick={() => setParams({ view: t.key === "week" ? null : t.key })}
              className={cn(
                "h-7 rounded px-3 text-body transition-colors",
                view === t.key ? "bg-accent-soft font-medium text-accent-strong" : "text-ink-muted hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {view !== "review" && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label={view === "week" ? "Previous week" : "Previous month"} onClick={() => shiftAnchor(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setParams({ date: null })}>
              Today
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={view === "week" ? "Next week" : "Next month"} onClick={() => shiftAnchor(1)}>
              <ChevronRight />
            </Button>
            <span className="num ml-2 text-body text-ink" data-testid="content-range">
              {rangeLabel}
            </span>
          </div>
        )}
        {view !== "review" && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <SelectField
              className="w-48"
              value={filters.account}
              onChange={(v) => setParams({ account: v })}
              noneLabel="All accounts"
              options={lists.socialAccounts.map((a) => ({ value: a.id, label: a.name }))}
            />
            {founder && (
              <SelectField
                className="w-40"
                value={filters.assignee}
                onChange={(v) => setParams({ assignee: v })}
                noneLabel="Everyone"
                options={socialMembers.map((m) => ({ value: m.id, label: m.full_name || m.email }))}
              />
            )}
            <SelectField
              className="w-44"
              value={filters.status}
              onChange={(v) => setParams({ status: v })}
              noneLabel="Any status"
              options={POST_STATUSES.filter((s) => s !== "idea").map((s) => ({ value: s, label: POST_STATUS_LABELS[s] }))}
            />
            <SelectField
              className="w-40"
              value={filters.pillar}
              onChange={(v) => setParams({ pillar: v })}
              noneLabel="Any pillar"
              options={lists.pillars.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
        )}
      </div>

      {view === "week" && <WeekView from={range.from} today={today} posts={posts} founder={founder} onOpen={open} />}
      {view === "month" && (
        <MonthView from={range.from} to={range.to} anchor={anchor} today={today} posts={posts} onPickDay={(d) => setParams({ view: null, date: d })} />
      )}
      {view === "list" && <ListView posts={posts} founder={founder} onOpen={open} />}
      {view === "review" && <ReviewList posts={review} onOpen={open} />}

      {view !== "review" && (ideas.length > 0 || !founder) && <IdeasPanel ideas={ideas} founder={founder} onOpen={open} />}
    </>
  );
}

// ---------- Week -------------------------------------------------------------------

function WeekView({
  from,
  today,
  posts,
  founder,
  onOpen,
}: {
  from: string;
  today: string;
  posts: PostItem[];
  founder: boolean;
  onOpen: (id: string) => void;
}) {
  const { timezone } = useProfile();
  const { openPostSheet } = useApp();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [active, setActive] = useState<PostItem | null>(null);
  const [moved, setMoved] = useState<Record<string, string>>({});
  const days = eachDay(from, addDays(from, 6));
  const dayOf = (p: PostItem) => moved[p.id] ?? localDateOf(p.scheduledAt!, timezone);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] } }),
  );

  const onDragStart = (e: DragStartEvent) => setActive(posts.find((p) => p.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const post = posts.find((p) => p.id === e.active.id);
    const to = e.over?.id;
    if (!post || typeof to !== "string") return;
    const fromDay = dayOf(post);
    const shift = diffDays(fromDay, to);
    if (shift === 0) return;
    if (to < today) {
      toast.error("Pick today or a later day.");
      return;
    }
    setMoved((m) => ({ ...m, [post.id]: to }));
    startTransition(async () => {
      const res = await reschedulePost({ id: post.id, shiftDays: shift });
      if (!res.ok) {
        setMoved((m) => {
          const next = { ...m };
          delete next[post.id];
          return next;
        });
        toast.error(res.error);
        return;
      }
      toast.success(`Moved to ${formatLocalDate(to, today)}`);
      router.refresh();
    });
  };

  const board = (
    <div className="overflow-x-auto pb-2">
      <div className="grid min-w-[980px] grid-cols-7 gap-2" data-testid="week-view">
        {days.map((d) => {
          const list = posts
            .filter((p) => p.scheduledAt && dayOf(p) === d)
            .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
          return (
            <DayColumn key={d} day={d} today={today} founder={founder} count={list.length} onAdd={() => openPostSheet({ mode: "new", day: d })}>
              {list.map((p) =>
                founder && MOVABLE.includes(p.status) ? (
                  <DraggablePost key={p.id} post={p} tz={timezone} onOpen={onOpen} />
                ) : (
                  <PostCard key={p.id} post={p} tz={timezone} onOpen={onOpen} />
                ),
              )}
            </DayColumn>
          );
        })}
      </div>
    </div>
  );

  if (!founder) return board;
  return (
    <DndContext id="content-week" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      {board}
      <DragOverlay>
        {active && (
          <div className={cn(CARD_CLASS, "w-44 rotate-1 shadow-overlay")}>
            <PostCardBody post={active} tz={timezone} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function DayColumn({
  day,
  today,
  founder,
  count,
  onAdd,
  children,
}: {
  day: string;
  today: string;
  founder: boolean;
  count: number;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: day, disabled: !founder });
  const isToday = day === today;
  const past = day < today;
  return (
    <section
      ref={setNodeRef}
      aria-label={`${formatLocalDate(day, today)}${isToday ? ", today" : ""}`}
      data-testid={`day-${day}`}
      className={cn(
        "group flex min-h-72 flex-col gap-2 rounded-lg border border-line bg-surface-muted/60 p-2 transition-colors",
        isToday && "border-accent-strong/40 bg-accent-soft/40",
        isOver && "bg-accent-soft",
      )}
    >
      <header className="flex items-baseline justify-between px-1 pt-0.5">
        <span className={cn("text-small font-medium", isToday ? "text-accent-strong" : "text-ink")}>
          {weekdayShort(day)} {Number(day.slice(8))}
        </span>
        {count > 0 && <span className="num text-small text-ink-muted">{count}</span>}
      </header>
      <div className="flex flex-col gap-2">{children}</div>
      {founder && !past && (
        <button
          type="button"
          onClick={onAdd}
          className={cn(
            "mt-auto flex items-center justify-center gap-1 rounded-md border border-dashed border-line py-2 text-small text-ink-muted transition-opacity hover:border-ink-faint hover:text-ink focus-visible:opacity-100",
            count > 0 && "opacity-0 group-hover:opacity-100",
          )}
        >
          <Plus className="size-3.5" aria-hidden /> Add post<span className="sr-only"> on {formatLocalDate(day, today)}</span>
        </button>
      )}
      {!founder && count === 0 && <p className="px-1 text-small text-ink-muted">Nothing planned</p>}
    </section>
  );
}

function DraggablePost({ post, tz, onOpen }: { post: PostItem; tz: string; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: post.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      aria-roledescription="Post card. Press space to pick up and move to another day."
      data-testid="post-card"
      data-post-id={post.id}
      onClick={() => onOpen(post.id)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === "Enter" && !isDragging) onOpen(post.id);
      }}
      className={cn(CARD_CLASS, "cursor-grab", isDragging && "opacity-40")}
    >
      <PostCardBody post={post} tz={tz} />
    </div>
  );
}

// ---------- Month --------------------------------------------------------------------

function MonthView({
  from,
  to,
  anchor,
  today,
  posts,
  onPickDay,
}: {
  from: string;
  to: string;
  anchor: string;
  today: string;
  posts: PostItem[];
  onPickDay: (day: string) => void;
}) {
  const { timezone } = useProfile();
  const month = anchor.slice(0, 7);
  const byDay = new Map<string, PostItem[]>();
  for (const p of posts) {
    if (!p.scheduledAt) continue;
    const d = localDateOf(p.scheduledAt, timezone);
    byDay.set(d, [...(byDay.get(d) ?? []), p]);
  }
  const days = eachDay(from, to);
  return (
    <Panel className="overflow-hidden" data-testid="month-view">
      <div className="grid grid-cols-7 border-b border-line bg-surface-muted text-small text-ink-muted">
        {days.slice(0, 7).map((d) => (
          <div key={d} className="px-2 py-1.5">
            {weekdayShort(d)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const list = (byDay.get(d) ?? []).sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
          const inMonth = d.slice(0, 7) === month;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onPickDay(d)}
              className={cn(
                "flex min-h-24 flex-col gap-1.5 border-r border-b border-line p-2 text-left transition-colors hover:bg-surface-muted [&:nth-child(7n)]:border-r-0",
                !inMonth && "bg-canvas text-ink-muted",
              )}
            >
              <span className="flex items-center justify-between">
                <span
                  className={cn(
                    "num text-small",
                    d === today ? "rounded-full bg-accent-strong px-1.5 font-medium text-white" : inMonth ? "text-ink" : "text-ink-muted",
                  )}
                >
                  {Number(d.slice(8))}
                </span>
                {list.length > 0 && (
                  <span className="num text-small text-ink-muted">
                    {list.length}
                    <span className="sr-only"> {list.length === 1 ? "post" : "posts"}</span>
                  </span>
                )}
              </span>
              <span className="flex flex-wrap gap-1">
                {list.slice(0, 12).map((p) => (
                  <span key={p.id} className={cn("size-2 rounded-full", POST_STATUS_DOT[p.status])} title={`${p.title}: ${POST_STATUS_LABELS[p.status]}`} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

// ---------- List ------------------------------------------------------------------------

type SortKey = "when" | "account" | "title" | "assignee" | "status";

type Sort = { key: SortKey; dir: "asc" | "desc" };

function SortTh({ k, label, sort, setSort }: { k: SortKey; label: string; sort: Sort; setSort: (fn: (s: Sort) => Sort) => void }) {
  return (
    <th
      scope="col"
      className="h-9 px-3 text-left text-small font-medium whitespace-nowrap text-ink-muted"
      aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-ink"
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k && s.dir === "asc" ? "desc" : "asc" }))}
      >
        {label}
        {sort.key === k && (sort.dir === "asc" ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />)}
      </button>
    </th>
  );
}

function ListView({ posts, founder, onOpen }: { posts: PostItem[]; founder: boolean; onOpen: (id: string) => void }) {
  const { lists } = useApp();
  const { timezone } = useProfile();
  const [sort, setSort] = useState<Sort>({ key: "when", dir: "asc" });
  const account = (id: string) => lists.socialAccounts.find((a) => a.id === id);
  const person = (id: string) => lists.members.find((m) => m.id === id)?.full_name ?? "";
  const pillar = (id: string | null) => lists.pillars.find((p) => p.id === id)?.name ?? "";
  const value = (p: PostItem): string => {
    switch (sort.key) {
      case "when":
        return p.scheduledAt ?? "";
      case "account":
        return account(p.accountId)?.name ?? "";
      case "title":
        return p.title;
      case "assignee":
        return person(p.assigneeId);
      case "status":
        return String(POST_STATUSES.indexOf(p.status)).padStart(2, "0");
    }
  };
  const rows = [...posts].sort((a, b) => value(a).localeCompare(value(b)) * (sort.dir === "asc" ? 1 : -1));

  const th = (k: SortKey, label: string) => <SortTh k={k} label={label} sort={sort} setSort={setSort} />;

  if (rows.length === 0) {
    return (
      <Panel>
        <EmptyState>No posts in this month match the filters.</EmptyState>
      </Panel>
    );
  }
  return (
    <Panel className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-body" data-testid="list-view">
          <thead className="bg-surface-muted">
            <tr className="border-b border-line">
              {th("when", "When (your time)")}
              {th("account", "Account")}
              {th("title", "Title")}
              {founder && th("assignee", "Assigned to")}
              <th scope="col" className="h-9 px-3 text-left text-small font-medium text-ink-muted">
                Pillar
              </th>
              {th("status", "Status")}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const a = account(p.accountId);
              return (
                <tr key={p.id} className="h-10 cursor-pointer border-b border-line last:border-0 hover:bg-surface-muted" onClick={() => onOpen(p.id)}>
                  <td className="num px-3 whitespace-nowrap">{p.scheduledAt ? formatDayTime(p.scheduledAt, timezone) : ""}</td>
                  <td className="px-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {a && <PlatformChip platform={a.platform} />} {a?.name}
                    </span>
                  </td>
                  <td className="max-w-80 truncate px-3">
                    <button type="button" className="text-left text-ink hover:underline" onClick={() => onOpen(p.id)}>
                      {p.title}
                    </button>
                  </td>
                  {founder && <td className="px-3 whitespace-nowrap">{person(p.assigneeId)}</td>}
                  <td className="px-3 whitespace-nowrap text-ink-muted">{pillar(p.pillarId)}</td>
                  <td className="px-3">
                    <PostStatusChip status={p.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ---------- Needs review and ideas ---------------------------------------------------------

function ReviewList({ posts, onOpen }: { posts: PostItem[]; onOpen: (id: string) => void }) {
  const { lists } = useApp();
  const { timezone } = useProfile();
  if (posts.length === 0) {
    return (
      <Panel>
        <EmptyState>Nothing waiting for review. Submitted drafts show up here, oldest first.</EmptyState>
      </Panel>
    );
  }
  return (
    <Panel>
      <ul className="divide-y divide-line" data-testid="review-list">
        {posts.map((p) => {
          const a = lists.socialAccounts.find((x) => x.id === p.accountId);
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              {a && <PlatformChip platform={a.platform} />}
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{p.title}</span>
              <span className="text-small text-ink-muted">{lists.members.find((m) => m.id === p.assigneeId)?.full_name}</span>
              <span className="num text-small text-ink-muted">{p.scheduledAt && formatDayTime(p.scheduledAt, timezone)}</span>
              <span className="text-small text-ink-muted">
                Submitted <RelativeTime at={p.updatedAt} tz={timezone} />
              </span>
              <Button size="sm" onClick={() => onOpen(p.id)}>
                Review
              </Button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function IdeasPanel({ ideas, founder, onOpen }: { ideas: PostItem[]; founder: boolean; onOpen: (id: string) => void }) {
  const { lists, openPostSheet } = useApp();
  return (
    <Panel className="mt-6" aria-label="Ideas">
      <PanelHeader
        title="Ideas"
        meta={<span className="num">{formatNumber(ideas.length)}</span>}
        actions={
          !founder && (
            <Button variant="secondary" size="sm" onClick={() => openPostSheet({ mode: "idea" })}>
              <Lightbulb aria-hidden /> Suggest an idea
            </Button>
          )
        }
      />
      {ideas.length === 0 ? (
        <EmptyState>No ideas yet. Suggest one and the founder can schedule it.</EmptyState>
      ) : (
        <ul className="divide-y divide-line" data-testid="ideas-list">
          {ideas.map((p) => {
            const a = lists.socialAccounts.find((x) => x.id === p.accountId);
            return (
              <li key={p.id}>
                <button type="button" onClick={() => onOpen(p.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-muted">
                  {a && <PlatformChip platform={a.platform} />}
                  <span className="min-w-0 flex-1 truncate text-ink">{p.title}</span>
                  <span className="text-small text-ink-muted">{lists.members.find((m) => m.id === p.createdBy)?.full_name}</span>
                  <PostStatusChip status={p.status} />
                  {founder && <span className="text-small text-accent-strong">Schedule</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
