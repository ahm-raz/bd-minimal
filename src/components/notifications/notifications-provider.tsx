"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/browser";
import { useProfile } from "@/components/app/profile-provider";
import { useApp } from "@/components/app/app-provider";
import { localDateOf, todayIn } from "@/lib/dates";
import { reminderLabel } from "@/lib/validation/meeting";
import {
  defaultPrefs,
  groupsFor,
  urgentCount,
  type NotificationGroup,
  type NotificationItem,
  type NotificationPref,
  type UpcomingItem,
} from "@/lib/notifications";
import {
  getNotificationPrefs,
  getUpcoming,
  listNotifications,
  markNotificationsRead,
} from "@/server/actions/notifications";

type Ctx = {
  unread: number;
  urgent: number;
  items: NotificationItem[] | null;
  hasMore: boolean;
  upcoming: UpcomingItem[] | null;
  prefs: NotificationPref[];
  setPrefs: (p: NotificationPref[]) => void;
  loadHappened: () => Promise<void>;
  loadMore: () => Promise<void>;
  refreshUpcoming: () => Promise<void>;
  /** Optimistic; resolves false (and restores the list) if it didn't save. */
  markRead: (ids: number[] | "all") => Promise<boolean>;
};

const NotificationsContext = createContext<Ctx | null>(null);

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications needs NotificationsProvider");
  return ctx;
}

const UPCOMING_REFRESH_MS = 5 * 60_000;
const REMINDER_TICK_MS = 20_000;
/** A reminder still fires if the tab was asleep, up to this long after its time. */
const REMINDER_GRACE_MS = 5 * 60_000;

/** Show a browser alert if allowed and the tab isn't in front (docs/10 section 3). */
function browserAlert(title: string, body: string | undefined, tag: string, link: string | null) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  const n = new Notification(title, { body, tag, icon: "/favicon.ico" });
  n.onclick = () => {
    window.focus();
    if (link) window.location.assign(link);
    n.close();
  };
}

/** Fire each meeting reminder once across open tabs (localStorage key per meeting, offset and start time). */
function claimReminder(key: string): boolean {
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

/**
 * Notification centre state for the whole app: unread count, live "What happened" items over Realtime,
 * "What's upcoming" (refreshed every 5 minutes and on focus), and in-app meeting reminders.
 */
export function NotificationsProvider({
  initialUnread,
  children,
}: {
  initialUnread: number;
  children: React.ReactNode;
}) {
  const profile = useProfile();
  const { department } = useApp();
  const router = useRouter();
  // The layout remounts this provider when the founder switches department, so this stays current.
  const groupsRef = useRef(groupsFor(profile.role, department));
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [upcoming, setUpcoming] = useState<UpcomingItem[] | null>(null);
  const [prefs, setPrefsState] = useState<NotificationPref[]>(defaultPrefs);
  /** Set once the user changes a setting, so the first load can't overwrite their click. */
  const prefsTouched = useRef(false);
  const setPrefs = useCallback((p: NotificationPref[]) => {
    prefsTouched.current = true;
    setPrefsState(p);
  }, []);
  const [nowMs, setNowMs] = useState(0);
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  const refreshUpcoming = useCallback(async () => {
    const res = await getUpcoming();
    if (res.ok) setUpcoming(res.data);
  }, []);

  const loadHappened = useCallback(async () => {
    const res = await listNotifications({});
    if (res.ok) {
      setItems(res.data.items);
      setHasMore(res.data.hasMore);
      setUnread(res.data.unread);
    }
  }, []);

  const loadMore = useCallback(async () => {
    const last = items?.at(-1);
    if (!last) return;
    const res = await listNotifications({ beforeId: last.id });
    if (res.ok) {
      setItems((list) => [...(list ?? []), ...res.data.items.filter((n) => !list?.some((x) => x.id === n.id))]);
      setHasMore(res.data.hasMore);
    }
  }, [items]);

  const markRead = useCallback(async (ids: number[] | "all") => {
    const at = new Date().toISOString();
    setItems(
      (list) => list?.map((n) => (ids === "all" || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? at } : n)) ?? null,
    );
    setUnread((u) => (ids === "all" ? 0 : Math.max(0, u - ids.length)));
    const res = await markNotificationsRead(ids === "all" ? { all: true } : { ids });
    if (!res.ok) {
      // Put the real state back rather than leave items looking read.
      toast.error(res.error);
      void loadHappened();
    }
    return res.ok;
  }, [loadHappened]);

  // First load, then keep "What's upcoming" fresh.
  useEffect(() => {
    // Clock for badge maths and reminders; starts on the client only.
    const tick = () => setNowMs(Date.now());
    const first = setTimeout(() => {
      tick();
      void refreshUpcoming();
    }, 0);
    const clock = setInterval(tick, REMINDER_TICK_MS);
    void getNotificationPrefs().then((r) => {
      if (r.ok && !prefsTouched.current) setPrefsState(r.data.prefs);
    });
    const timer = setInterval(() => void refreshUpcoming(), UPCOMING_REFRESH_MS);
    const onFocus = () => void refreshUpcoming();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(clock);
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshUpcoming]);

  // Live "What happened".
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
        .channel(`notifications-${profile.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${profile.id}` },
          (payload) => {
            const r = payload.new as Record<string, unknown>;
            // Outside the founder's department view: it waits in the other view.
            if (!groupsRef.current.includes(r.kind_group as NotificationGroup)) return;
            const n: NotificationItem = {
              id: Number(r.id),
              kind: String(r.kind),
              group: r.kind_group as NotificationGroup,
              priority: r.priority === "high" ? "high" : "normal",
              title: String(r.title),
              link: (r.link as string | null) ?? null,
              createdAt: String(r.created_at),
              readAt: null,
            };
            setItems((list) => (list ? (list.some((x) => x.id === n.id) ? list : [n, ...list]) : list));
            setUnread((u) => u + 1);
            if (n.priority === "high") {
              toast(n.title, n.link ? { action: { label: "Open", onClick: () => router.push(n.link!) } } : undefined);
            }
            if (prefsRef.current.find((p) => p.group === n.group)?.browser)
              browserAlert(n.title, undefined, `n:${n.id}`, n.link);
            // Something changed for this user; upcoming lists may have too (e.g. a task was assigned).
            void refreshUpcoming();
          },
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [profile.id, router, refreshUpcoming]);

  // Meeting reminders while the app is open.
  useEffect(() => {
    if (!upcoming || !nowMs) return;
    const meetingsBrowser = prefs.find((p) => p.group === "meetings")?.browser ?? false;
    for (const i of upcoming) {
      if (i.kind !== "meeting" || !i.at) continue;
      const start = new Date(i.at).getTime();
      for (const minutes of i.reminders ?? []) {
        const fireAt = start - minutes * 60_000;
        if (nowMs < fireAt || nowMs > fireAt + REMINDER_GRACE_MS || nowMs > start) continue;
        if (!claimReminder(`cao-reminder:${i.key}:${minutes}:${i.at}`)) continue;
        const title = `${i.title} in ${reminderLabel(minutes)}`;
        toast(title, {
          description: i.detail ?? undefined,
          duration: 60_000,
          action: i.joinUrl
            ? { label: "Join", onClick: () => window.open(i.joinUrl!, "_blank", "noopener") }
            : { label: "Open", onClick: () => router.push(i.link) },
        });
        if (meetingsBrowser) browserAlert(title, i.detail ?? undefined, `r:${i.key}:${minutes}`, i.link);
      }
    }
  }, [upcoming, nowMs, prefs, router]);

  const urgent = useMemo(() => {
    if (!upcoming || !nowMs) return 0;
    const now = new Date(nowMs);
    return urgentCount(upcoming, now, todayIn(profile.timezone, now), (iso) =>
      localDateOf(new Date(iso), profile.timezone),
    );
  }, [upcoming, nowMs, profile.timezone]);

  const value = useMemo<Ctx>(
    () => ({
      unread,
      urgent,
      items,
      hasMore,
      upcoming,
      prefs,
      setPrefs,
      loadHappened,
      loadMore,
      refreshUpcoming,
      markRead,
    }),
    [unread, urgent, items, hasMore, upcoming, prefs, setPrefs, loadHappened, loadMore, refreshUpcoming, markRead],
  );
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
