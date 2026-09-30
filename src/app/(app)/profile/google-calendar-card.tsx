"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "@/components/app/nav-progress";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Chip } from "@/components/common/chips";
import { Panel, PanelHeader } from "@/components/common/page";
import { disconnectGoogle, setGoogleAutoAdd, syncCalendarNow } from "@/server/actions/google";

export type GoogleConnection = {
  email: string;
  status: "active" | "needs_reconnect";
  autoAdd: boolean;
  lastError: string | null;
} | null;

const RESULT: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Google Calendar connected. Booked meetings will appear in your calendar." },
  denied: { ok: false, text: "Google Calendar wasn't connected: access was declined." },
  scope: {
    ok: false,
    text: "Google Calendar wasn't connected: tick the calendar permission on Google's screen and try again.",
  },
  expired: { ok: false, text: "That took too long. Click Connect Google Calendar again." },
  error: { ok: false, text: "Google Calendar wasn't connected. Try again." },
  off: { ok: false, text: "Google Calendar isn't turned on for this app yet." },
};

/** Profile → Google Calendar (docs/10 section 2). */
export function GoogleCalendarCard({ connection }: { connection: GoogleConnection }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  // Show the result of the Google round trip once, then drop it from the URL.
  useEffect(() => {
    const r = params.get("google");
    if (!r || !RESULT[r]) return;
    if (RESULT[r].ok) toast.success(RESULT[r].text);
    else toast.error(RESULT[r].text);
    router.replace("/profile#google-calendar", { scroll: false });
  }, [params, router]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "That didn't work. Try again.");
      else toast.success(success);
      router.refresh();
    });

  return (
    <Panel className="max-w-xl scroll-mt-4" id="google-calendar" aria-label="Google Calendar">
      <PanelHeader
        title="Google Calendar"
        meta={
          connection ? (
            connection.status === "active" ? (
              <Chip tone="ok">Connected</Chip>
            ) : (
              <Chip tone="warn">Needs reconnect</Chip>
            )
          ) : (
            <Chip>Not connected</Chip>
          )
        }
      />
      <div className="flex flex-col gap-4 p-5">
        {!connection ? (
          <>
            <p className="text-body text-ink-muted">
              Connect your own Google Calendar and every meeting you book is added to it at the right time, with your
              reminders. Rescheduling moves the event; cancelling removes it. The app can only change events on
              calendars you own, and never reads your other events.
            </p>
            <p className="text-small text-ink-muted">
              Google may say it hasn&apos;t verified this app. Click <b>Advanced</b>, then{" "}
              <b>Go to Client Acquisition OS</b>.
            </p>
            <div>
              <Button asChild>
                <a href="/api/google/connect">Connect Google Calendar</a>
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-body text-ink">
              Connected as <b>{connection.email}</b>
            </p>
            {connection.status === "needs_reconnect" && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-warn-soft px-3 py-2 text-small text-warn-ink"
              >
                <span>Google access expired or was removed. Reconnect to keep adding meetings.</span>
                <Button asChild size="sm">
                  <a href="/api/google/connect">Reconnect</a>
                </Button>
              </div>
            )}
            <label className="flex items-center justify-between gap-3 text-body text-ink">
              Add booked meetings to my calendar
              <Switch
                checked={connection.autoAdd}
                disabled={pending}
                onCheckedChange={(v) =>
                  run(() => setGoogleAutoAdd({ autoAdd: v }), v ? "Meetings will be added" : "Meetings won't be added")
                }
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => run(syncCalendarNow, "Calendar is up to date")}
              >
                Sync now
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => run(disconnectGoogle, "Google Calendar disconnected")}
              >
                Disconnect
              </Button>
            </div>
            <p className="text-small text-ink-muted">
              Disconnecting stops syncing. Events already in your calendar stay there.
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}
