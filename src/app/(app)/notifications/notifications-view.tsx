"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader, Panel, PanelHeader } from "@/components/common/page";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { HappenedList, UpcomingList } from "@/components/notifications/notification-lists";
import { useNow } from "@/lib/use-now";
import { GROUP_LABELS, type NotificationGroup, type NotificationItem } from "@/lib/notifications";
import { listNotifications } from "@/server/actions/notifications";

export function NotificationsView({ groups }: { groups: NotificationGroup[] }) {
  const { upcoming, markRead, unread } = useNotifications();
  const now = useNow();
  const [group, setGroup] = useState<NotificationGroup | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = useCallback(
    (beforeId?: number) =>
      startTransition(async () => {
        const res = await listNotifications({ group, unreadOnly, beforeId: beforeId ?? null });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setItems((list) => (beforeId ? [...(list ?? []), ...res.data.items] : res.data.items));
        setHasMore(res.data.hasMore);
      }),
    [group, unreadOnly],
  );
  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader title="Notifications" meta={unread ? `${unread} unread` : undefined} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel aria-label="What happened">
          <PanelHeader
            title="What happened"
            actions={
              unread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void markRead("all").then(() =>
                      setItems((l) => l?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null),
                    )
                  }
                >
                  Mark all as read
                </Button>
              )
            }
          />
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2">
            {[null, ...groups].map((g) => (
              <button
                key={g ?? "all"}
                type="button"
                aria-pressed={group === g}
                onClick={() => setGroup(g)}
                className={cn(
                  "h-7 rounded-md border px-2.5 text-small",
                  group === g
                    ? "border-accent-strong bg-accent-soft text-accent-strong"
                    : "border-line bg-surface text-ink hover:bg-surface-muted",
                )}
              >
                {g ? GROUP_LABELS[g] : "All"}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-small text-ink">
              <Checkbox checked={unreadOnly} onCheckedChange={(v) => setUnreadOnly(!!v)} /> Unread only
            </label>
          </div>
          <div className={cn(pending && "opacity-60")}>
            <HappenedList
              items={items}
              emptyText={
                unreadOnly || group ? "Nothing matches these filters." : "Nothing yet. Moves by your team show up here."
              }
              onOpen={(n) => {
                if (!n.readAt) void markRead([n.id]);
              }}
            />
          </div>
          {hasMore && (
            <div className="border-t border-line p-3 text-center">
              <Button variant="secondary" size="sm" disabled={pending} onClick={() => load(items?.at(-1)?.id)}>
                Load more
              </Button>
            </div>
          )}
        </Panel>
        <Panel aria-label="What's upcoming" className="self-start">
          <PanelHeader title="What's upcoming" />
          <UpcomingList items={upcoming} now={now} />
        </Panel>
      </div>
    </>
  );
}
