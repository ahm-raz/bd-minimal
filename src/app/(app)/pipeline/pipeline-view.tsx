"use client";

import { onTablistKeyDown } from "@/lib/tablist";
import { BusyRegion, useFilterNav } from "@/components/app/nav-progress";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { ArrowDown, ArrowUp, Clock, Columns3, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { StageChip } from "@/components/common/chips";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page";
import { SelectField } from "@/components/common/select-field";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { OpportunitySheet } from "@/components/pipeline/opportunity-sheet";
import { useStageChange } from "@/components/pipeline/stage-change";
import { STAGE_KEYS, OPEN_STAGE_KEYS } from "@/lib/domain";
import { diffDays, formatLocalDate, localDateOf, todayIn } from "@/lib/dates";
import { formatMoney, formatNumber, initials } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import type { PipelineCard, PipelineFilters, PipelineTotals } from "@/server/queries/pipeline";

const STUCK_DAYS = 14;

export function PipelineView({ cards, totals, filters }: { cards: PipelineCard[]; totals: PipelineTotals; filters: PipelineFilters }) {
  const { lists } = useApp();
  const profile = useProfile();
  const isFounder = profile.role === "founder";
  const { pending: loading, replaceQuery } = useFilterNav();
  const params = useSearchParams();
  const now = useNow();
  const today = todayIn(profile.timezone);
  const [openId, setOpenId] = useState<string | null>(null);
  const stageChange = useStageChange();

  // Optimistic stage overrides, rolled back if the server rejects the move.
  const [moved, setMoved] = useState<Record<string, string>>({});
  const [synced, setSynced] = useState(cards);
  if (synced !== cards) {
    setSynced(cards);
    setMoved({});
  }
  const live = useMemo(() => cards.map((c) => (moved[c.id] ? { ...c, stage: moved[c.id]! } : c)), [cards, moved]);

  const isStuck = (c: PipelineCard) =>
    (OPEN_STAGE_KEYS as string[]).includes(c.stage) && !!now && now.getTime() - new Date(c.stageChangedAt).getTime() > STUCK_DAYS * 86_400_000;
  const daysInStage = (c: PipelineCard) => Math.max(0, diffDays(localDateOf(c.stageChangedAt, profile.timezone), today));
  const shown = filters.stuck ? live.filter(isStuck) : live;

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    replaceQuery(next);
  };

  const move = (card: PipelineCard, to: string) => {
    if (card.stage === to) return;
    const closing = to === "won" || to === "lost" || card.stage === "won" || card.stage === "lost";
    if (!closing) setMoved((m) => ({ ...m, [card.id]: to }));
    stageChange.request(
      { id: card.id, title: card.title, company: card.company, stage: card.stage, estimatedValue: card.estimatedValue },
      to,
      (ok) => {
        if (!ok) {
          // cancelled or rejected: the card returns to its column
          setMoved((m) => {
            const next = { ...m };
            delete next[card.id];
            return next;
          });
        } else if (closing) {
          setMoved((m) => ({ ...m, [card.id]: to }));
        }
      },
    );
  };

  const memberName = (id: string) => lists.members.find((m) => m.id === id)?.full_name ?? "";

  return (
    <BusyRegion busy={loading}>
      <PageHeader
        title="Pipeline"
        meta={
          <span className="num">
            Open {formatMoney(totals.openValue)}, weighted {formatMoney(totals.weightedValue)}
          </span>
        }
        actions={
          <div className="flex rounded-md border border-line bg-surface p-0.5" role="group" aria-label="View">
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={filters.view === "board"}
              className={cn(filters.view === "board" && "bg-accent-soft text-accent-strong")}
              onClick={() => setParams({ view: null })}
            >
              <Columns3 aria-hidden /> Board
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={filters.view === "list"}
              className={cn(filters.view === "list" && "bg-accent-soft text-accent-strong")}
              onClick={() => setParams({ view: "list" })}
            >
              <List aria-hidden /> List
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {isFounder && (
          <div className="w-52">
            <SelectField
              aria-label="Owner"
              value={filters.owner}
              onChange={(v) => setParams({ owner: v })}
              noneLabel="Everyone"
              options={lists.salesMembers.map((m) => ({ value: m.id, label: m.full_name || m.email }))}
              className="h-8"
            />
          </div>
        )}
        <div className="w-44">
          <SelectField
            aria-label="Niche"
            value={filters.niche}
            onChange={(v) => setParams({ niche: v })}
            noneLabel="All niches"
            options={lists.niches.map((n) => ({ value: n.id, label: n.name }))}
            className="h-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="stuck-only" checked={filters.stuck} onCheckedChange={(v) => setParams({ stuck: v ? "1" : null })} />
          <Label htmlFor="stuck-only" className="text-body">
            Stuck only
          </Label>
        </div>
        {totals.stuck > 0 && (
          <span className="num inline-flex items-center gap-1 text-small text-warn">
            <Clock className="size-3.5" aria-hidden /> {formatNumber(totals.stuck)} stuck
          </span>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface">
          <EmptyState action={<Button variant="secondary" asChild><Link href="/leads">Open leads</Link></Button>}>
            No opportunities yet. Create one from a lead when there&apos;s real buying interest.
          </EmptyState>
        </div>
      ) : filters.view === "list" ? (
        <OpportunityList cards={shown} onOpen={setOpenId} memberName={memberName} isFounder={isFounder} />
      ) : (
        <Board
          cards={shown}
          showAll={filters.showAll}
          onToggleAll={() => setParams({ closed: filters.showAll ? null : "all" })}
          onMove={move}
          onOpen={setOpenId}
          isStuck={isStuck}
          daysInStage={daysInStage}
          memberName={memberName}
          isFounder={isFounder}
        />
      )}

      <OpportunitySheet id={openId} onClose={() => setOpenId(null)} />
      {stageChange.dialogs}
    </BusyRegion>
  );
}

function Board({
  cards,
  showAll,
  onToggleAll,
  onMove,
  onOpen,
  isStuck,
  daysInStage,
  memberName,
  isFounder,
}: {
  cards: PipelineCard[];
  showAll: boolean;
  onToggleAll: () => void;
  onMove: (card: PipelineCard, to: string) => void;
  onOpen: (id: string) => void;
  isStuck: (c: PipelineCard) => boolean;
  daysInStage: (c: PipelineCard) => number;
  memberName: (id: string) => string;
  isFounder: boolean;
}) {
  const { lists } = useApp();
  const [active, setActive] = useState<PipelineCard | null>(null);
  // Phones show one stage at a time; the picker above the column switches it.
  const [mobileStage, setMobileStage] = useState<string>(STAGE_KEYS[0]);
  // On touch screens a drag starts after a short press, so swiping still scrolls the page.
  const [coarse] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const sensors = useSensors(
    useSensor(
      PointerSensor,
      coarse ? { activationConstraint: { delay: 250, tolerance: 8 } } : { activationConstraint: { distance: 6 } },
    ),
    useSensor(KeyboardSensor),
  );

  const onDragStart = (e: DragStartEvent) => setActive(cards.find((c) => c.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const card = cards.find((c) => c.id === e.active.id);
    const to = e.over?.id;
    if (card && typeof to === "string") onMove(card, to);
  };

  return (
    <DndContext id="pipeline-board" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div
        role="tablist"
        aria-label="Stage"
        className="-mx-4 mb-3 flex snap-x gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-none md:hidden"
        onKeyDown={onTablistKeyDown}
      >
        {STAGE_KEYS.map((key) => {
          const stage = lists.stages.find((s) => s.key === key);
          const count = cards.filter((c) => c.stage === key).length;
          const on = key === mobileStage;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setMobileStage(key)}
              className={cn(
                "h-9 shrink-0 snap-start rounded-full border px-3 text-small whitespace-nowrap transition-colors",
                on ? "border-accent-strong bg-accent-soft font-medium text-accent-strong" : "border-line bg-surface text-ink-muted",
              )}
            >
              {stage?.label ?? key} <span className="num">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="grid gap-3 md:min-w-[1100px] md:grid-cols-6">
          {STAGE_KEYS.map((key) => {
            const stage = lists.stages.find((s) => s.key === key);
            const list = cards.filter((c) => c.stage === key);
            const value = list.reduce((s, c) => s + (key === "won" ? (c.wonValue ?? 0) : c.estimatedValue), 0);
            const weighted = stage?.is_open ? list.reduce((s, c) => s + c.estimatedValue * (stage.probability ?? 0), 0) : null;
            return (
              <div key={key} className={cn("grid min-w-0", key !== mobileStage && "max-md:hidden")}>
              <Column
                key={key}
                stageKey={key}
                label={stage?.label ?? key}
                count={list.length}
                value={value}
                weighted={weighted}
                footer={
                  (key === "won" || key === "lost") && (
                    <Button variant="link" size="sm" className="self-start" onClick={onToggleAll}>
                      {showAll ? "Show last 30 days" : "Show all"}
                    </Button>
                  )
                }
              >
                {list.map((c) => (
                  <Card
                    key={c.id}
                    card={c}
                    stuck={isStuck(c)}
                    days={daysInStage(c)}
                    ownerInitials={isFounder ? initials(memberName(c.ownerId)) : null}
                    ownerName={memberName(c.ownerId)}
                    onOpen={() => onOpen(c.id)}
                  />
                ))}
              </Column>
              </div>
            );
          })}
        </div>
      </div>
      <DragOverlay>
        {active && (
          <div className="rotate-1 rounded-lg border border-line bg-surface p-3 shadow-overlay">
            <div className="text-body font-medium text-ink">{active.company}</div>
            <div className="text-small text-ink-muted">{active.title}</div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  stageKey,
  label,
  count,
  value,
  weighted,
  footer,
  children,
}: {
  stageKey: string;
  label: string;
  count: number;
  value: number;
  weighted: number | null;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageKey });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${label} column`}
      data-testid={`column-${stageKey}`}
      className={cn(
        "flex min-h-64 flex-col gap-2 rounded-lg border border-line bg-surface-muted/60 p-2 transition-colors",
        isOver && "bg-accent-soft",
      )}
    >
      <header className="px-1 pt-1 pb-1">
        <div className="flex items-center justify-between gap-2">
          <StageChip stage={stageKey} label={label} />
          <span className="num text-small text-ink-muted" data-testid={`count-${stageKey}`}>
            {formatNumber(count)}
          </span>
        </div>
        <div className="num mt-1 text-small text-ink">{formatMoney(value)}</div>
        {weighted !== null && <div className="num text-micro font-normal text-ink-muted">Weighted {formatMoney(weighted)}</div>}
      </header>
      <div className="flex flex-col gap-2">{children}</div>
      {footer}
    </section>
  );
}

function Card({
  card,
  stuck,
  days,
  ownerInitials,
  ownerName,
  onOpen,
}: {
  card: PipelineCard;
  stuck: boolean;
  days: number;
  ownerInitials: string | null;
  ownerName: string;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`${card.company}, ${card.title}`}
      aria-roledescription="Opportunity card. Press space to pick up."
      aria-describedby={`card-meta-${card.id}`}
      data-testid={`card-${card.title}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === "Enter") onOpen();
      }}
      className={cn(
        "cursor-grab rounded-lg border border-line bg-surface p-3 text-left shadow-card outline-none transition-[box-shadow,border-color,transform] duration-150 hover:border-line-strong hover:shadow-raised focus-visible:outline-2 focus-visible:outline-accent-strong active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <span id={`card-meta-${card.id}`} className="sr-only">
        {days} days in stage{stuck ? ", stuck" : ""}
        {ownerInitials ? `, owner ${ownerName}` : ""}
      </span>
      <div className="truncate text-body font-medium text-ink">{card.company}</div>
      <div className="truncate text-small text-ink-muted">{card.title}</div>
      <div className="mt-2 flex items-center gap-2 text-small">
        <span className="num text-ink">{formatMoney(card.stage === "won" ? (card.wonValue ?? card.estimatedValue) : card.estimatedValue)}</span>
        <span className={cn("num ml-auto inline-flex items-center gap-1", stuck ? "text-warn" : "text-ink-muted")} title={stuck ? "Stuck: 14+ days in this stage" : "Days in stage"}>
          {stuck && <Clock className="size-3.5" aria-label="Stuck" />}
          {days}d
        </span>
        {ownerInitials && (
          <span className="num rounded-md bg-surface-muted px-1 text-micro text-ink-muted" title={ownerName}>
            {ownerInitials}
          </span>
        )}
      </div>
    </article>
  );
}

type SortKey = "value" | "close";

function OpportunityList({
  cards,
  onOpen,
  memberName,
  isFounder,
}: {
  cards: PipelineCard[];
  onOpen: (id: string) => void;
  memberName: (id: string) => string;
  isFounder: boolean;
}) {
  const { lists } = useApp();
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "value", dir: "desc" });
  const sorted = [...cards].sort((a, b) => {
    const d = sort.dir === "asc" ? 1 : -1;
    if (sort.key === "value") return (a.estimatedValue - b.estimatedValue) * d;
    return ((a.expectedCloseDate ?? "9999") < (b.expectedCloseDate ?? "9999") ? -1 : 1) * d;
  });
  const header = (key: SortKey, label: string) => (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:text-ink"
      onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}
    >
      {label}
      {sort.key === key && (sort.dir === "asc" ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />)}
    </button>
  );
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-body">
        <thead className="bg-surface-muted">
          <tr className="border-b border-line text-left text-small text-ink-muted">
            <th scope="col" className="h-9 px-3 font-medium">Company</th>
            <th scope="col" className="px-3 font-medium">Opportunity</th>
            <th scope="col" className="px-3 font-medium">Stage</th>
            <th scope="col" className="px-3 text-right font-medium" aria-sort={sort.key === "value" ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
              {header("value", "Value")}
            </th>
            <th scope="col" className="px-3 font-medium" aria-sort={sort.key === "close" ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
              {header("close", "Expected close")}
            </th>
            {isFounder && <th scope="col" className="px-3 font-medium">Owner</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id} className="h-10 cursor-pointer border-b border-line last:border-0 hover:bg-surface-muted" onClick={() => onOpen(c.id)}>
              <td className="px-3">
                <Link href={`/leads/${c.leadId}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                  {c.company}
                </Link>
              </td>
              <td className="px-3">
                <button type="button" className="hover:underline" onClick={() => onOpen(c.id)}>
                  {c.title}
                </button>
              </td>
              <td className="px-3">
                <StageChip stage={c.stage} label={lists.stages.find((s) => s.key === c.stage)?.label ?? c.stage} />
              </td>
              <td className="num px-3 text-right">{formatMoney(c.estimatedValue)}</td>
              <td className="num px-3 text-ink-muted">{c.expectedCloseDate ? formatLocalDate(c.expectedCloseDate) : "Not set"}</td>
              {isFounder && <td className="px-3 text-ink-muted">{memberName(c.ownerId)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
