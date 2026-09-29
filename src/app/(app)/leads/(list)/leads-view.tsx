"use client";

import { useFilterNav } from "@/components/app/nav-progress";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  columnVisibilityFeature,
  createColumnHelper,
  rowSelectionFeature,
  tableFeatures,
  useTable,
  type RowSelectionState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronDown, Columns3, Flag, ListFilter, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { RelativeTime } from "@/components/common/relative-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusChip } from "@/components/common/chips";
import { EmptyState } from "@/components/common/empty-state";
import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page";
import { SelectField } from "@/components/common/select-field";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, PRIORITIES, PRIORITY_LABELS, type LeadStatus } from "@/lib/domain";
import { completenessTone } from "@/lib/completeness";
import { dueLabel, dueState, formatLocalDate, todayIn } from "@/lib/dates";
import { contactName, formatNumber, initials } from "@/lib/format";
import {
  activeFilterCount,
  BD_VIEWS,
  COMP_LABELS,
  DUE_LABELS,
  FOUNDER_VIEWS,
  PAGE_SIZE,
  viewLabel,
  type LeadFilters,
  type SortKey,
} from "@/lib/lead-filters";
import { bulkUpdateLeads, deleteLeads, reassignLeads } from "@/server/actions/leads";
import type { LeadRow } from "@/server/queries/leads";

const features = tableFeatures({ columnVisibilityFeature, rowSelectionFeature });
const helper = createColumnHelper<typeof features, LeadRow>();
const EMPTY: LeadRow[] = [];

const COLUMN_LABELS: Record<string, string> = {
  company: "Company",
  contact: "Contact",
  status: "Status",
  niche: "Niche",
  channel: "Channel",
  campaign: "Campaign",
  next_action: "Next action",
  due: "Due",
  completeness: "Complete",
  last_activity: "Last activity",
  owner: "Owner",
  created: "Created",
};
const SORTABLE: Record<string, SortKey> = {
  company: "company",
  status: "status",
  due: "due",
  completeness: "completeness",
  last_activity: "last_activity",
  created: "created",
};
const DEFAULT_HIDDEN = { channel: false, campaign: false, created: false };

function useColumnVisibility(userId: string) {
  const key = `cao:lead-columns:${userId}`;
  const [visibility, setVisibility] = useState<Record<string, boolean>>(DEFAULT_HIDDEN);
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    try {
      const saved = window.localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read localStorage once after mount (not available during SSR)
      if (saved) setVisibility(JSON.parse(saved) as Record<string, boolean>);
    } catch {
      // ignore bad saved state
    }
  }, [key]);
  const update = (next: Record<string, boolean>) => {
    setVisibility(next);
    window.localStorage.setItem(key, JSON.stringify(next));
  };
  return [visibility, update] as const;
}

export function LeadsView({ rows, total, filters }: { rows: LeadRow[]; total: number; filters: LeadFilters }) {
  const { lists, openNewLead } = useApp();
  const profile = useProfile();
  const isFounder = profile.role === "founder";
  const router = useRouter();
  const pathname = usePathname();
  const { pending: loading, replaceQuery } = useFilterNav();
  const params = useSearchParams();
  const today = todayIn(profile.timezone);
  const [pending, startTransition] = useTransition();
  const [visibility, setVisibility] = useColumnVisibility(profile.id);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [search, setSearch] = useState(filters.q);
  const [dialog, setDialog] = useState<null | "reassign" | "delete" | "tag">(null);

  const nameOf = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name ?? "";
  const memberName = (id: string) => lists.members.find((m) => m.id === id)?.full_name ?? "";

  const setParams = (patch: Record<string, string | null>, resetLimit = true) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (resetLimit && !("limit" in patch)) next.delete("limit");
    setRowSelection({});
    replaceQuery(next);
  };

  // "/" from another page lands here with ?focus=search
  useEffect(() => {
    if (params.get("focus") === "search") {
      document.getElementById("lead-search")?.focus();
      const next = new URLSearchParams(params.toString());
      next.delete("focus");
      router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on arrival
  }, []);

  // Debounced search into the URL
  useEffect(() => {
    if (search.trim() === filters.q) return;
    const t = setTimeout(() => setParams({ q: search.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [search]);

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: "select",
          enableHiding: false,
          header: ({ table }) => (
            <Checkbox
              aria-label="Select all leads on this page"
              checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? "indeterminate" : false}
              onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)}
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              aria-label={`Select ${row.original.company_name}`}
              checked={row.getIsSelected()}
              onCheckedChange={(v) => row.toggleSelected(!!v)}
              onClick={(e) => e.stopPropagation()}
            />
          ),
        }),
        helper.display({
          id: "company",
          enableHiding: false,
          header: () => COLUMN_LABELS.company,
          cell: ({ row }) => {
            const l = row.original;
            const place = [l.city, l.state_region].filter(Boolean).join(", ");
            return (
              <div className="min-w-48">
                <Link href={`/leads/${l.id}`} className="font-medium text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                  {l.company_name}
                </Link>
                {l.flagged && <Flag className="ml-1.5 inline size-3.5 text-bad" aria-label="Flagged" />}
                {place && <div className="text-small text-ink-muted">{place}</div>}
              </div>
            );
          },
        }),
        helper.display({
          id: "contact",
          header: () => COLUMN_LABELS.contact,
          cell: ({ row }) =>
            row.original.contact ? (
              <div>
                <div>{contactName(row.original.contact)}</div>
                {row.original.contact.job_title && <div className="text-small text-ink-muted">{row.original.contact.job_title}</div>}
              </div>
            ) : (
              <span className="text-ink-muted">None</span>
            ),
        }),
        helper.display({ id: "status", header: () => COLUMN_LABELS.status, cell: ({ row }) => <StatusChip status={row.original.status} /> }),
        helper.display({ id: "niche", header: () => COLUMN_LABELS.niche, cell: ({ row }) => nameOf(lists.niches, row.original.niche_id) }),
        helper.display({ id: "channel", header: () => COLUMN_LABELS.channel, cell: ({ row }) => nameOf(lists.channels, row.original.channel_id) }),
        helper.display({
          id: "campaign",
          header: () => COLUMN_LABELS.campaign,
          cell: ({ row }) => nameOf(lists.campaigns, row.original.campaign_id) || <span className="text-ink-muted">None</span>,
        }),
        helper.display({
          id: "next_action",
          header: () => COLUMN_LABELS.next_action,
          cell: ({ row }) =>
            row.original.next_action ? (
              <span className="block max-w-56 truncate">{row.original.next_action}</span>
            ) : (
              <span className="text-ink-muted">None</span>
            ),
        }),
        helper.display({
          id: "due",
          header: () => COLUMN_LABELS.due,
          cell: ({ row }) => {
            const d = row.original.next_action_due;
            if (!d) return null;
            const s = dueState(d, today);
            return (
              <span className={cn("num", s === "overdue" && "text-bad", s === "today" && "text-warn")} title={formatLocalDate(d)}>
                {dueLabel(d, today)}
              </span>
            );
          },
        }),
        helper.display({
          id: "completeness",
          header: () => COLUMN_LABELS.completeness,
          cell: ({ row }) => {
            const c = row.original.completeness;
            const tone = completenessTone(c);
            return (
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-12 rounded-full bg-surface-muted" aria-hidden>
                  <div
                    className={cn("h-full rounded-full", { "bg-bad": tone === "bad", "bg-warn": tone === "warn", "bg-ok": tone === "ok" })}
                    style={{ width: `${c}%` }}
                  />
                </div>
                <span className="num w-9 text-right">{c}%</span>
              </div>
            );
          },
        }),
        helper.display({
          id: "last_activity",
          header: () => COLUMN_LABELS.last_activity,
          cell: ({ row }) =>
            row.original.last_activity_at ? (
              <RelativeTime at={row.original.last_activity_at} tz={profile.timezone} className="text-ink-muted" />
            ) : (
              <span className="text-ink-muted">None</span>
            ),
        }),
        helper.display({
          id: "owner",
          header: () => COLUMN_LABELS.owner,
          cell: ({ row }) => (
            <span className="num text-micro text-ink-muted" title={memberName(row.original.owner_id)}>
              {initials(memberName(row.original.owner_id))}
            </span>
          ),
        }),
        helper.display({
          id: "created",
          header: () => COLUMN_LABELS.created,
          cell: ({ row }) => <RelativeTime at={row.original.created_at} tz={profile.timezone} className="text-ink-muted" />,
        }),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lists and tz are stable for the page
    [lists, profile.timezone, today],
  );

  const columnVisibility = useMemo(
    () => (isFounder ? visibility : { ...visibility, owner: false }),
    [isFounder, visibility],
  );
  const table = useTable({
    features,
    columns,
    data: rows.length ? rows : EMPTY,
    getRowId: (r) => r.id,
    state: { columnVisibility, rowSelection },
    onColumnVisibilityChange: (u) => setVisibility(typeof u === "function" ? u(columnVisibility) : u),
    onRowSelectionChange: (u) => setRowSelection((prev) => (typeof u === "function" ? u(prev) : u)),
  });

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);
  const views = isFounder ? FOUNDER_VIEWS : BD_VIEWS;
  const filterCount = activeFilterCount(filters);

  const runBulk = (fn: () => Promise<{ ok: boolean; error?: string; data?: { count: number } }>, verb: string) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const n = res.data?.count ?? selectedIds.length;
      toast.success(`${formatNumber(n)} ${n === 1 ? "lead" : "leads"} ${verb}`);
      setRowSelection({});
      setDialog(null);
      router.refresh();
    });

  return (
    <>
      <PageHeader
        title="Leads"
        meta={<span className="num">{formatNumber(total)}</span>}
        actions={
          <Button onClick={() => openNewLead()}>
            <Plus aria-hidden /> Lead
            <kbd className="ml-1 font-mono text-micro font-normal opacity-80">N</kbd>
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <Input
            id="lead-search"
            type="search"
            aria-label="Search leads"
            placeholder="Search company, contact, email, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">
              {viewLabel(filters.view, isFounder)} <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Views</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={filters.view} onValueChange={(v) => setParams({ view: v === "mine" ? null : v })}>
              {views.map((v) => (
                <DropdownMenuRadioItem key={v} value={v}>
                  {viewLabel(v, isFounder)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <FiltersPopover filters={filters} count={filterCount} setParams={setParams} />

        {filterCount > 0 && (
          <Button
            variant="ghost"
            onClick={() =>
              setParams({
                status: null, niche: null, channel: null, campaign: null, source: null, priority: null,
                owner: null, due: null, comp: null, from: null, to: null, flagged: null, tags: null,
              })
            }
          >
            <X aria-hidden /> Clear filters
          </Button>
        )}

        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" className="max-sm:hidden">
                <Columns3 aria-hidden /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllLeafColumns()
                .filter((c) => c.getCanHide() && (isFounder || c.id !== "owner"))
                .map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={c.getIsVisible()}
                    onCheckedChange={(v) => c.toggleVisibility(!!v)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {COLUMN_LABELS[c.id]}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent-strong/30 bg-accent-soft px-3 py-2" role="region" aria-label="Bulk actions">
          <span className="num mr-2 text-body font-medium text-accent-strong">{formatNumber(selectedIds.length)} selected</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">Set status</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {LEAD_STATUSES.map((s) => (
                <DropdownMenuItem key={s} onSelect={() => runBulk(() => bulkUpdateLeads({ ids: selectedIds, status: s }), "updated")}>
                  {LEAD_STATUS_LABELS[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">Set campaign</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => runBulk(() => bulkUpdateLeads({ ids: selectedIds, campaignId: null }), "updated")}>
                No campaign
              </DropdownMenuItem>
              {lists.campaigns
                .filter((c) => c.status === "active")
                .map((c) => (
                  <DropdownMenuItem key={c.id} onSelect={() => runBulk(() => bulkUpdateLeads({ ids: selectedIds, campaignId: c.id }), "updated")}>
                    {c.name}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">Set priority</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {PRIORITIES.map((p) => (
                <DropdownMenuItem key={p} onSelect={() => runBulk(() => bulkUpdateLeads({ ids: selectedIds, priority: p }), "updated")}>
                  {PRIORITY_LABELS[p]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="secondary" size="sm" onClick={() => setDialog("tag")}>
            Add tag
          </Button>
          {isFounder && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setDialog("reassign")}>
                Reassign
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setDialog("delete")}>
                Delete
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setRowSelection({})}>
            Clear selection
          </Button>
        </div>
      )}

      <div className={cn("overflow-hidden rounded-lg border border-line bg-surface shadow-card transition-opacity", (pending || loading) && "opacity-60")}>
        {rows.length === 0 ? (
          filters.q || filterCount > 0 || filters.view !== "mine" ? (
            <EmptyState action={<Button variant="secondary" onClick={() => router.replace(pathname)}>Show my open leads</Button>}>
              No leads match these filters. Clear a filter or try another view.
            </EmptyState>
          ) : isFounder ? (
            <EmptyState action={<Button variant="secondary" onClick={() => setParams({ view: "all" })}>Show all team leads</Button>}>
              You have no open leads of your own. Press N to add one, or look at the team&apos;s leads.
            </EmptyState>
          ) : (
            <EmptyState action={<Button variant="secondary" onClick={() => setParams({ view: "all" })}>Show all my leads</Button>}>
              You have no open leads. Press N to add one. Customers and closed leads are under All my leads.
            </EmptyState>
          )
        ) : (
          <>
          {/* Phones: one card per lead, one scroll direction (docs/07 section 3). */}
          <ul className="divide-y divide-line sm:hidden" data-testid="lead-cards">
            {rows.map((r) => {
              const s = r.next_action_due ? dueState(r.next_action_due, today) : null;
              return (
                <li key={r.id}>
                  <Link
                    href={`/leads/${r.id}`}
                    className="flex flex-col gap-1 px-4 py-3 transition-colors active:bg-surface-muted"
                  >
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.company_name}</span>
                      {r.flagged && <Flag className="size-3.5 shrink-0 text-bad" aria-label="Flagged" />}
                      <StatusChip status={r.status} />
                    </span>
                    {r.contact && <span className="truncate text-small text-ink-muted">{contactName(r.contact)}</span>}
                    <span className="flex items-center gap-2 text-small">
                      <span className="min-w-0 flex-1 truncate text-ink-muted">{r.next_action ?? "No next step"}</span>
                      {r.next_action_due && (
                        <span className={cn("num shrink-0", s === "overdue" && "text-bad", s === "today" && "text-warn-ink")}>
                          {dueLabel(r.next_action_due, today)}
                        </span>
                      )}
                      {isFounder && (
                        <span className="num shrink-0 text-micro text-ink-muted">{initials(memberName(r.owner_id))}</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden max-h-[calc(100vh-220px)] overflow-auto sm:block">
            <table className="w-full text-body">
              <thead className="sticky top-0 z-10 bg-surface-muted">
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id} className="border-b border-line">
                    {group.headers.map((header) => {
                      const sortKey = SORTABLE[header.column.id];
                      const active = sortKey && filters.sort === sortKey;
                      const numeric = header.column.id === "completeness";
                      return (
                        <th
                          key={header.id}
                          scope="col"
                          aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : undefined}
                          className={cn("h-9 px-3 text-left text-small font-medium whitespace-nowrap text-ink-muted", header.column.id === "select" && "w-10", numeric && "text-right")}
                        >
                          {sortKey ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 hover:text-ink"
                              onClick={() =>
                                setParams({ sort: sortKey, dir: active && filters.dir === "desc" ? "asc" : "desc" }, false)
                              }
                            >
                              <table.FlexRender header={header} />
                              {active && (filters.dir === "asc" ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />)}
                            </button>
                          ) : (
                            <table.FlexRender header={header} />
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    className="h-10 cursor-pointer border-b border-line transition-colors last:border-0 focus-within:bg-surface-muted hover:bg-surface-muted data-[state=selected]:bg-accent-soft"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button,a,input,[role=checkbox]")) return;
                      router.push(`/leads/${row.original.id}`);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={cn("px-3 py-1.5 align-middle whitespace-nowrap", cell.column.id === "completeness" && "text-right")}>
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {rows.length < total && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <span className="num text-small text-ink-muted">
            Showing {formatNumber(rows.length)} of {formatNumber(total)}
          </span>
          <Button variant="secondary" disabled={pending} onClick={() => setParams({ limit: String(filters.limit + PAGE_SIZE) }, false)}>
            Load more
          </Button>
        </div>
      )}

      {dialog === "reassign" && (
        <ReassignLeadsDialog
          count={selectedIds.length}
          onClose={() => setDialog(null)}
          onConfirm={(toId) => runBulk(() => reassignLeads({ ids: selectedIds, toId }), "reassigned")}
          pending={pending}
        />
      )}
      {dialog === "tag" && (
        <TagDialog
          onClose={() => setDialog(null)}
          onConfirm={(tag) => runBulk(() => bulkUpdateLeads({ ids: selectedIds, addTag: tag }), "tagged")}
          pending={pending}
        />
      )}
      <Dialog open={dialog === "delete"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {formatNumber(selectedIds.length)} {selectedIds.length === 1 ? "lead" : "leads"}?
            </DialogTitle>
            <DialogDescription>
              Their contacts, activities and opportunities are deleted too. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => runBulk(() => deleteLeads({ ids: selectedIds }), "deleted")}>
              Delete leads
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FiltersPopover({
  filters,
  count,
  setParams,
}: {
  filters: LeadFilters;
  count: number;
  setParams: (patch: Record<string, string | null>) => void;
}) {
  const { lists } = useApp();
  const { role } = useProfile();
  const opts = (list: { id: string; name: string }[]) => list.map((x) => ({ value: x.id, label: x.name }));
  const toggleStatus = (s: LeadStatus) => {
    const next = filters.status.includes(s) ? filters.status.filter((x) => x !== s) : [...filters.status, s];
    setParams({ status: next.length ? next.join(",") : null });
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary">
          <ListFilter aria-hidden /> Filters
          {count > 0 && <span className="num rounded-md bg-accent-soft px-1.5 text-micro text-accent-strong">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[520px] max-w-[calc(100vw-2rem)] p-4">
        <div className="grid gap-4">
          <fieldset>
            <legend className="mb-1.5 text-small font-medium text-ink">Status</legend>
            <div className="flex flex-wrap gap-1.5">
              {LEAD_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={filters.status.includes(s)}
                  onClick={() => toggleStatus(s)}
                  className={cn(
                    "h-7 rounded-md border px-2 text-small",
                    filters.status.includes(s) ? "border-accent-strong bg-accent-soft text-accent-strong" : "border-line text-ink hover:bg-surface-muted",
                  )}
                >
                  {LEAD_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Niche" htmlFor="f-niche">
              <SelectField id="f-niche" value={filters.niche} onChange={(v) => setParams({ niche: v })} noneLabel="Any" options={opts(lists.niches)} />
            </FormField>
            <FormField label="Channel" htmlFor="f-channel">
              <SelectField id="f-channel" value={filters.channel} onChange={(v) => setParams({ channel: v })} noneLabel="Any" options={opts(lists.channels)} />
            </FormField>
            <FormField label="Campaign" htmlFor="f-campaign">
              <SelectField id="f-campaign" value={filters.campaign} onChange={(v) => setParams({ campaign: v })} noneLabel="Any" options={opts(lists.campaigns)} />
            </FormField>
            <FormField label="Source" htmlFor="f-source">
              <SelectField id="f-source" value={filters.source} onChange={(v) => setParams({ source: v })} noneLabel="Any" options={opts(lists.sources)} />
            </FormField>
            <FormField label="Priority" htmlFor="f-priority">
              <SelectField
                id="f-priority"
                value={filters.priority}
                onChange={(v) => setParams({ priority: v })}
                noneLabel="Any"
                options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
              />
            </FormField>
            {role === "founder" && (
              <FormField label="Owner" htmlFor="f-owner">
                <SelectField
                  id="f-owner"
                  value={filters.owner}
                  onChange={(v) => setParams({ owner: v })}
                  noneLabel="Anyone"
                  options={lists.salesMembers.map((m) => ({ value: m.id, label: m.full_name || m.email }))}
                />
              </FormField>
            )}
            <FormField label="Due" htmlFor="f-due">
              <SelectField
                id="f-due"
                value={filters.due}
                onChange={(v) => setParams({ due: v })}
                noneLabel="Any"
                options={Object.entries(DUE_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </FormField>
            <FormField label="Completeness" htmlFor="f-comp">
              <SelectField
                id="f-comp"
                value={filters.comp}
                onChange={(v) => setParams({ comp: v })}
                noneLabel="Any"
                options={Object.entries(COMP_LABELS).map(([value, label]) => ({ value, label }))}
              />
            </FormField>
            <FormField label="Created from" htmlFor="f-from">
              <Input id="f-from" type="date" value={filters.from ?? ""} onChange={(e) => setParams({ from: e.target.value || null })} />
            </FormField>
            <FormField label="Created to" htmlFor="f-to">
              <Input id="f-to" type="date" value={filters.to ?? ""} onChange={(e) => setParams({ to: e.target.value || null })} />
            </FormField>
            <FormField label="Tags" htmlFor="f-tags" helper="Comma separated; any match.">
              <Input
                id="f-tags"
                defaultValue={filters.tags.join(", ")}
                onBlur={(e) => setParams({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean).join(",") || null })}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
            </FormField>
            <label className="flex items-center gap-2 self-end pb-2 text-body text-ink">
              <Checkbox checked={filters.flagged} onCheckedChange={(v) => setParams({ flagged: v ? "1" : null })} />
              Flagged only
            </label>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ReassignLeadsDialog({
  count,
  onClose,
  onConfirm,
  pending,
}: {
  count: number;
  onClose: () => void;
  onConfirm: (toId: string) => void;
  pending: boolean;
}) {
  const { lists } = useApp();
  const [toId, setToId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Reassign {formatNumber(count)} {count === 1 ? "lead" : "leads"}
          </DialogTitle>
          <DialogDescription>Open opportunities move with the leads. Past activities keep their original user.</DialogDescription>
        </DialogHeader>
        <FormField label="New owner" htmlFor="bulk-owner" error={error}>
          <SelectField
            id="bulk-owner"
            value={toId}
            onChange={setToId}
            placeholder="Pick a person"
            options={lists.salesMembers.filter((m) => m.is_active).map((m) => ({ value: m.id, label: m.full_name || m.email }))}
            invalid={!!error}
          />
        </FormField>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => (toId ? onConfirm(toId) : setError("Pick the new owner."))}>
            Reassign leads
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TagDialog({ onClose, onConfirm, pending }: { onClose: () => void; onConfirm: (tag: string) => void; pending: boolean }) {
  const [tag, setTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a tag</DialogTitle>
          <DialogDescription>Tags are lowercase, up to 30 characters.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!tag.trim()) return setError("Enter a tag.");
            onConfirm(tag);
          }}
          className="flex flex-col gap-4"
        >
          <FormField label="Tag" htmlFor="bulk-tag" error={error}>
            <Input id="bulk-tag" value={tag} autoFocus onChange={(e) => setTag(e.target.value)} aria-invalid={!!error} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Add tag
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
