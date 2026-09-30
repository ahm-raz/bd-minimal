"use client";

import { ListSkeleton } from "@/components/common/page-skeleton";
import Link from "next/link";
import { Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/components/app/profile-provider";
import { RelativeTime } from "@/components/common/relative-time";
import { formatCountdown, formatLocalDate, localDateOf, todayIn } from "@/lib/dates";
import { BUCKET_LABELS, groupUpcoming, type NotificationItem, type UpcomingItem } from "@/lib/notifications";

const KIND_LABEL: Record<UpcomingItem["kind"], string> = {
  meeting: "Meeting",
  follow_up: "Follow-up",
  task: "Task",
  deal_close: "Deal",
  deal_stuck: "Stuck deal",
  post: "Post",
  draft: "Draft",
  changes: "Changes requested",
  review: "Review",
  team_overdue: "Team",
};

/** "What's upcoming", grouped Overdue · Within the hour · Today · Next 7 days (docs/10 section 3). */
export function UpcomingList({
  items,
  now,
  onNavigate,
}: {
  items: UpcomingItem[] | null;
  now: Date | null;
  onNavigate?: () => void;
}) {
  const profile = useProfile();
  if (!items || !now) return <ListSkeleton label="Loading what's upcoming" />;
  const today = todayIn(profile.timezone, now);
  const groups = groupUpcoming(items, now, today, (iso) => localDateOf(new Date(iso), profile.timezone));
  if (!groups.length)
    return <p className="px-4 py-6 text-small text-ink-muted">Nothing coming up in the next 7 days.</p>;
  return (
    <div className="flex flex-col" data-testid="upcoming-list">
      {groups.map((g) => (
        <section key={g.bucket} aria-label={BUCKET_LABELS[g.bucket]}>
          <h3
            className={cn(
              "px-4 pt-3 pb-1 text-micro",
              g.bucket === "overdue" ? "text-bad" : "text-ink-muted",
            )}
          >
            {BUCKET_LABELS[g.bucket]} · {g.items.length}
          </h3>
          <ul>
            {g.items.map((i) => (
              <li key={i.key} className="flex items-start gap-2 px-4 py-2 hover:bg-surface-muted">
                <Link href={i.link} onClick={onNavigate} className="min-w-0 flex-1">
                  <p className="truncate text-body text-ink">{i.title}</p>
                  <p className="truncate text-small text-ink-muted">
                    {KIND_LABEL[i.kind]}
                    {i.detail && ` · ${i.detail}`}
                    {!i.at &&
                      i.date &&
                      i.kind !== "changes" &&
                      i.kind !== "review" &&
                      i.kind !== "team_overdue" &&
                      ` · ${i.date === today ? "today" : formatLocalDate(i.date)}`}
                  </p>
                </Link>
                {i.at && i.kind === "meeting" && (
                  <span
                    className={cn("shrink-0 num text-small", g.bucket === "overdue" ? "text-bad" : "text-warn-ink")}
                  >
                    {formatCountdown(i.at, now)}
                  </span>
                )}
                {i.joinUrl && (
                  <a
                    href={i.joinUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Join ${i.title}`}
                    className="shrink-0 text-accent-strong"
                  >
                    <Video className="size-4" aria-hidden />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** "What happened": newest first, unread dot, click opens and marks read. */
export function HappenedList({
  items,
  onOpen,
  emptyText = "You're up to date.",
}: {
  items: NotificationItem[] | null;
  onOpen: (n: NotificationItem) => void;
  emptyText?: string;
}) {
  const profile = useProfile();
  if (!items) return <ListSkeleton label="Loading notifications" />;
  if (!items.length) return <p className="px-4 py-6 text-small text-ink-muted">{emptyText}</p>;
  return (
    <ul data-testid="happened-list">
      {items.map((n) => (
        <li key={n.id}>
          <Link
            href={n.link ?? "/notifications"}
            onClick={() => onOpen(n)}
            className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-surface-muted"
            data-unread={!n.readAt || undefined}
          >
            <span
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                n.readAt ? "bg-transparent" : n.priority === "high" ? "bg-bad" : "bg-accent-strong",
              )}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className={cn("block text-body", n.readAt ? "text-ink-muted" : "text-ink")}>{n.title}</span>
              <RelativeTime at={n.createdAt} tz={profile.timezone} className="text-small text-ink-muted" />
            </span>
            {!n.readAt && <span className="sr-only">Unread</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
