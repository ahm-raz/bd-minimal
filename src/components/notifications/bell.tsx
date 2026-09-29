"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNow } from "@/lib/use-now";
import { useNotifications } from "./notifications-provider";
import { HappenedList, UpcomingList } from "./notification-lists";

type Tab = "upcoming" | "happened";

/** The bell (docs/10 section 3): badge = unread "What happened" + urgent "What's upcoming". */
export function NotificationBell({ className }: { className?: string }) {
  const { unread, urgent, items, upcoming, loadHappened, markRead, refreshUpcoming } = useNotifications();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("upcoming");
  const now = useNow();
  const total = unread + urgent;

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) {
      setTab(unread > 0 ? "happened" : "upcoming");
      void loadHappened();
      void refreshUpcoming();
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", className)}
          aria-label={total ? `Notifications, ${unread} unread, ${urgent} due soon` : "Notifications"}
          data-testid="bell"
        >
          <Bell />
          {total > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 num text-[10px] leading-none font-semibold text-on-bad"
              data-testid="bell-count"
            >
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-[380px] max-w-[calc(100vw-1rem)] gap-0 p-0">
        <div role="tablist" aria-label="Notifications" className="flex border-b border-line">
          {(
            [
              ["upcoming", "What's upcoming", urgent],
              ["happened", "What happened", unread],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-small",
                tab === key ? "border-accent-strong text-ink" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {label}
              {count > 0 && <span className="rounded-full bg-surface-muted px-1.5 num text-micro">{count}</span>}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="max-h-[60vh] overflow-y-auto">
          {tab === "upcoming" ? (
            <UpcomingList items={upcoming} now={now} onNavigate={() => setOpen(false)} />
          ) : (
            <HappenedList
              items={items?.slice(0, 20) ?? null}
              onOpen={(n) => {
                if (!n.readAt) void markRead([n.id]);
                setOpen(false);
              }}
            />
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line px-3 py-2">
          {tab === "happened" && unread > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => void markRead("all")}>
              Mark all as read
            </Button>
          ) : (
            <span />
          )}
          <Button asChild variant="ghost" size="sm">
            <Link href="/notifications" onClick={() => setOpen(false)}>
              See all
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
