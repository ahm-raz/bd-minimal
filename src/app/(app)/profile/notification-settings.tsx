"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Panel, PanelHeader } from "@/components/common/page";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { GROUP_HELP, GROUP_LABELS, type NotificationGroup } from "@/lib/notifications";
import { MAX_REMINDERS, REMINDER_CHOICES } from "@/lib/validation/meeting";
import { saveMeetingReminders, saveNotificationPref } from "@/server/actions/notifications";

type Permission = "default" | "granted" | "denied" | "unsupported";

/** Profile → Notifications (docs/10 section 4). */
export function NotificationSettings({
  groups,
  meetingReminders,
}: {
  groups: NotificationGroup[];
  meetingReminders: number[];
}) {
  const { prefs, setPrefs } = useNotifications();
  const [permission, setPermission] = useState<Permission>("default");
  const [reminders, setReminders] = useState(meetingReminders);
  const [, startTransition] = useTransition();

  useEffect(() => {
    // Read the browser's setting after mount (it isn't known on the server).
    const read = () =>
      setPermission(!("Notification" in window) ? "unsupported" : (Notification.permission as Permission));
    const t = setTimeout(read, 0);
    return () => clearTimeout(t);
  }, []);

  const save = (group: NotificationGroup, patch: { inApp?: boolean; browser?: boolean }) => {
    const current = prefs.find((p) => p.group === group)!;
    const next = { ...current, ...patch };
    setPrefs(prefs.map((p) => (p.group === group ? next : p)));
    startTransition(async () => {
      const res = await saveNotificationPref(next);
      if (!res.ok) {
        toast.error(res.error);
        setPrefs(prefs);
      }
    });
  };

  const allow = async () => {
    const result = await Notification.requestPermission();
    setPermission(result as Permission);
    if (result === "granted") {
      toast.success("Browser alerts allowed");
      new Notification("Browser alerts are on", {
        body: "You'll see alerts like this when the app is in the background.",
      });
    }
  };

  const toggleReminder = (m: number) => {
    const next = reminders.includes(m) ? reminders.filter((x) => x !== m) : [...reminders, m].slice(-MAX_REMINDERS);
    setReminders(next);
    startTransition(async () => {
      const res = await saveMeetingReminders({ reminders: next });
      if (!res.ok) toast.error(res.error);
    });
  };

  return (
    <Panel className="max-w-xl" aria-label="Notifications">
      <PanelHeader title="Notifications" />
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-small text-ink-muted">
            {permission === "granted"
              ? "Browser alerts are allowed in this browser."
              : permission === "denied"
                ? "Browser alerts are blocked. Allow them in your browser's site settings."
                : permission === "unsupported"
                  ? "This browser doesn't support alerts."
                  : "Allow browser alerts to hear about things while the app is in the background."}
          </p>
          {permission === "default" && (
            <Button size="sm" variant="secondary" onClick={() => void allow()}>
              Allow browser alerts
            </Button>
          )}
        </div>

        <table className="w-full text-body">
          <thead>
            <tr className="text-left text-small text-ink-muted">
              <th className="pb-2 font-normal">Group</th>
              <th className="w-20 pb-2 text-center font-normal">In app</th>
              <th className="w-24 pb-2 text-center font-normal">Browser alert</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {groups.map((g) => {
              const p = prefs.find((x) => x.group === g)!;
              return (
                <tr key={g}>
                  <td className="py-2 pr-2">
                    <span className="block text-ink">{GROUP_LABELS[g]}</span>
                    <span className="block text-small text-ink-muted">{GROUP_HELP[g]}</span>
                  </td>
                  <td className="py-2 text-center">
                    <Switch
                      aria-label={`${GROUP_LABELS[g]} in app`}
                      checked={p.inApp}
                      onCheckedChange={(v) => save(g, { inApp: v, browser: v ? p.browser : false })}
                    />
                  </td>
                  <td className="py-2 text-center">
                    <Switch
                      aria-label={`${GROUP_LABELS[g]} browser alert`}
                      checked={p.browser}
                      disabled={!p.inApp || permission !== "granted"}
                      onCheckedChange={(v) => save(g, { browser: v })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {groups.includes("meetings") && (
          <div className="flex flex-col gap-1.5">
            <span className="text-body text-ink">Default meeting reminders</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Default meeting reminders">
              {REMINDER_CHOICES.map((r) => (
                <button
                  key={r.minutes}
                  type="button"
                  aria-pressed={reminders.includes(r.minutes)}
                  onClick={() => toggleReminder(r.minutes)}
                  className={cn(
                    "h-7 rounded-md border px-2.5 text-small transition-colors",
                    reminders.includes(r.minutes)
                      ? "border-accent-strong bg-accent-soft text-accent-strong"
                      : "border-line bg-surface text-ink hover:bg-surface-muted",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <span className="text-small text-ink-muted">Used for new meetings; each meeting can change them.</span>
          </div>
        )}
      </div>
    </Panel>
  );
}
