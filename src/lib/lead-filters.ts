import { LEAD_STATUSES, PRIORITIES, type LeadPriority, type LeadStatus } from "@/lib/domain";
import { isLocalDate } from "@/lib/dates";

/** Leads list filters, kept in the URL query string so views can be shared (docs/07 section 3). */
export type LeadView = "mine" | "no_next" | "overdue" | "incomplete" | "customers" | "all" | "flagged";
export type DueFilter = "overdue" | "today" | "week" | "none";
export type CompletenessFilter = "lt50" | "50to79" | "80plus";
export type SortKey = "company" | "status" | "due" | "completeness" | "last_activity" | "created";

export type LeadFilters = {
  view: LeadView;
  q: string;
  status: LeadStatus[];
  niche: string | null;
  channel: string | null;
  campaign: string | null;
  source: string | null;
  priority: LeadPriority | null;
  owner: string | null;
  due: DueFilter | null;
  comp: CompletenessFilter | null;
  from: string | null;
  to: string | null;
  flagged: boolean;
  tags: string[];
  sort: SortKey;
  dir: "asc" | "desc";
  limit: number;
};

export const VIEW_LABELS: Record<LeadView, string> = {
  mine: "My open leads",
  no_next: "No next action",
  overdue: "Overdue",
  incomplete: "Incomplete (<50%)",
  customers: "Customers",
  all: "All team leads",
  flagged: "Flagged",
};
/** For a BD, "all" is every lead they own, closed ones included (RLS shows them nothing else). */
export const BD_VIEW_LABELS: Partial<Record<LeadView, string>> = { all: "All my leads" };
export const BD_VIEWS: LeadView[] = ["mine", "no_next", "overdue", "incomplete", "customers", "all"];
export const FOUNDER_VIEWS: LeadView[] = ["mine", "no_next", "overdue", "incomplete", "customers", "all", "flagged"];
export const viewLabel = (view: LeadView, isFounder: boolean) => (isFounder ? undefined : BD_VIEW_LABELS[view]) ?? VIEW_LABELS[view];

export const DUE_LABELS: Record<DueFilter, string> = { overdue: "Overdue", today: "Due today", week: "Due this week", none: "No next action" };
export const COMP_LABELS: Record<CompletenessFilter, string> = { lt50: "Under 50%", "50to79": "50–79%", "80plus": "80% or more" };

export const PAGE_SIZE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SORTS: SortKey[] = ["company", "status", "due", "completeness", "last_activity", "created"];

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function get(sp: Params, key: string): string | null {
  if (sp instanceof URLSearchParams) return sp.get(key);
  const v = sp[key];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

const uuid = (v: string | null) => (v && UUID.test(v) ? v : null);
const list = (v: string | null) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : []);

export function parseLeadFilters(sp: Params, isFounder: boolean): LeadFilters {
  const views = isFounder ? FOUNDER_VIEWS : BD_VIEWS;
  const view = (get(sp, "view") ?? "mine") as LeadView;
  const due = get(sp, "due") as DueFilter | null;
  const comp = get(sp, "comp") as CompletenessFilter | null;
  const sort = get(sp, "sort") as SortKey | null;
  const limit = Number(get(sp, "limit") ?? PAGE_SIZE);
  const priority = get(sp, "priority") as LeadPriority | null;
  return {
    view: views.includes(view) ? view : "mine",
    q: (get(sp, "q") ?? "").trim().slice(0, 100),
    status: list(get(sp, "status")).filter((s): s is LeadStatus => (LEAD_STATUSES as string[]).includes(s)),
    niche: uuid(get(sp, "niche")),
    channel: uuid(get(sp, "channel")),
    campaign: uuid(get(sp, "campaign")),
    source: uuid(get(sp, "source")),
    priority: priority && PRIORITIES.includes(priority) ? priority : null,
    owner: isFounder ? uuid(get(sp, "owner")) : null,
    due: due && ["overdue", "today", "week", "none"].includes(due) ? due : null,
    comp: comp && ["lt50", "50to79", "80plus"].includes(comp) ? comp : null,
    from: isLocalDate(get(sp, "from") ?? "") ? get(sp, "from") : null,
    to: isLocalDate(get(sp, "to") ?? "") ? get(sp, "to") : null,
    flagged: get(sp, "flagged") === "1",
    tags: list(get(sp, "tags")).map((t) => t.toLowerCase()).slice(0, 10),
    sort: sort && SORTS.includes(sort) ? sort : "created",
    dir: get(sp, "dir") === "asc" ? "asc" : "desc",
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 1000) : PAGE_SIZE,
  };
}

/** Number of filters set besides the view, search, sort and page size. */
export function activeFilterCount(f: LeadFilters): number {
  return [
    f.status.length > 0,
    f.niche,
    f.channel,
    f.campaign,
    f.source,
    f.priority,
    f.owner,
    f.due,
    f.comp,
    f.from || f.to,
    f.flagged,
    f.tags.length > 0,
  ].filter(Boolean).length;
}
