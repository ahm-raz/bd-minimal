import type { Department } from "@/lib/department";
/**
 * Notifications (docs/10 section 3): "What happened" items are stored per recipient by the database;
 * "What's upcoming" items are computed on request. This file is shared by server and client.
 */

export const NOTIFICATION_GROUPS = ["meetings", "deals", "leads", "tasks", "social"] as const;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

export const GROUP_LABELS: Record<NotificationGroup, string> = {
  meetings: "Meetings",
  deals: "Deals",
  leads: "Leads",
  tasks: "Tasks",
  social: "Social",
};

export const GROUP_HELP: Record<NotificationGroup, string> = {
  meetings: "Meetings booked, moved, cancelled or held",
  deals: "Deals created, moved, won or lost",
  leads: "Leads reassigned or flagged, and activities others log on your leads",
  tasks: "Tasks assigned to you, and tasks completed (founder)",
  social: "Posts to review, approved, changes requested, missed, comments",
};

/** Groups that make sense for a role (SMMs never see sales items). */
/** The groups a role hears about; the founder's department view narrows them (src/lib/department.ts). */
export function groupsFor(role: "founder" | "bd" | "social", department: Department = "all"): NotificationGroup[] {
  if (role === "social" || department === "social") return ["tasks", "social"];
  if (role === "bd" || department === "sales") return ["meetings", "deals", "leads", "tasks"];
  return [...NOTIFICATION_GROUPS];
}

export type NotificationItem = {
  id: number;
  kind: string;
  group: NotificationGroup;
  priority: "normal" | "high";
  title: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
};

export type NotificationPref = { group: NotificationGroup; inApp: boolean; browser: boolean };

export function defaultPrefs(): NotificationPref[] {
  return NOTIFICATION_GROUPS.map((group) => ({ group, inApp: true, browser: false }));
}

// ---------- What's upcoming ----------------------------------------------

export type UpcomingKind =
  | "meeting"
  | "follow_up"
  | "task"
  | "deal_close"
  | "deal_stuck"
  | "post"
  | "draft"
  | "changes"
  | "review"
  /** Founder: a member with overdue tasks; `date` is their oldest overdue due date. */
  | "team_overdue";

export type UpcomingItem = {
  key: string;
  kind: UpcomingKind;
  title: string;
  detail: string | null;
  link: string;
  /** An exact time (meetings, posts, drafts) … */
  at: string | null;
  /** … or a local date (follow-ups, tasks, deals), in the viewer's time zone. */
  date: string | null;
  /** Meetings: the meeting's own zone, for the dual-zone line. */
  timezone?: string;
  joinUrl?: string | null;
  /** Meetings: minutes before the start to remind (in-app while open). */
  reminders?: number[];
};

export const UPCOMING_BUCKETS = ["overdue", "hour", "today", "week"] as const;
export type UpcomingBucket = (typeof UPCOMING_BUCKETS)[number];
export const BUCKET_LABELS: Record<UpcomingBucket, string> = {
  overdue: "Overdue",
  hour: "Within the hour",
  today: "Today",
  week: "Next 7 days",
};

/**
 * Which bucket an item falls in. `today` is the viewer's local date; `localDateOfAt` turns an instant
 * into the viewer's local date.
 */
export function bucketOf(
  item: Pick<UpcomingItem, "at" | "date" | "kind">,
  now: Date,
  today: string,
  localDateOfAt: (iso: string) => string,
): UpcomingBucket {
  if (item.kind === "changes" || item.kind === "review") return "today";
  if (item.at) {
    const t = new Date(item.at).getTime();
    if (t < now.getTime()) return "overdue";
    if (t - now.getTime() <= 3_600_000) return "hour";
    return localDateOfAt(item.at) === today ? "today" : "week";
  }
  if (item.date) {
    if (item.date < today) return "overdue";
    return item.date === today ? "today" : "week";
  }
  return "week";
}

/** Items sorted into buckets, each bucket in time order. */
export function groupUpcoming(
  items: UpcomingItem[],
  now: Date,
  today: string,
  localDateOfAt: (iso: string) => string,
): { bucket: UpcomingBucket; items: UpcomingItem[] }[] {
  const sortKey = (i: UpcomingItem) => i.at ?? `${i.date ?? "9999-12-31"}T23:59`;
  return UPCOMING_BUCKETS.map((bucket) => ({
    bucket,
    items: items
      .filter((i) => bucketOf(i, now, today, localDateOfAt) === bucket)
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
  })).filter((g) => g.items.length > 0);
}

/** Badge count: overdue, within the hour, and anything else due in the next 24 hours. */
export function urgentCount(
  items: UpcomingItem[],
  now: Date,
  today: string,
  localDateOfAt: (iso: string) => string,
): number {
  return items.filter((i) => {
    const b = bucketOf(i, now, today, localDateOfAt);
    if (b === "overdue" || b === "hour" || b === "today") return true;
    return !!i.at && new Date(i.at).getTime() - now.getTime() <= 86_400_000;
  }).length;
}
