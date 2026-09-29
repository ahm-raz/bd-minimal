"use client";

import Link from "next/link";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/common/page";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { formatCountdown, formatDualZone, localDateOf } from "@/lib/dates";
import { useNow } from "@/lib/use-now";
import { meetingLink } from "@/lib/validation/meeting";
import type { UpcomingMeeting } from "@/server/queries/meetings";
import type { CalendarStatus } from "./meeting-fields";

/** My Day → Meetings: today and the next 7 days (docs/10 section 4). The founder sees the team's. */
export function MyDayMeetings({ meetings, calendar }: { meetings: UpcomingMeeting[]; calendar: CalendarStatus }) {
  const profile = useProfile();
  const { lists } = useApp();
  const now = useNow();
  const today = localDateOf(now ?? new Date(), profile.timezone);
  const isToday = (m: UpcomingMeeting) => localDateOf(new Date(m.startsAt), profile.timezone) === today;
  const todays = meetings.filter(isToday);
  const later = meetings.filter((m) => !isToday(m));
  const ownerName = (id: string) =>
    id === profile.id ? null : (lists.members.find((p) => p.id === id)?.full_name ?? null);

  return (
    <>
      {calendar === "needs_reconnect" && (
        <p role="alert" className="mb-6 rounded-lg border border-warn bg-warn-soft px-4 py-3 text-body text-warn-ink">
          Reconnect Google Calendar to keep adding meetings.{" "}
          <Link href="/profile#google-calendar" className="font-medium underline">
            Reconnect
          </Link>
        </p>
      )}
      {meetings.length > 0 && (
        <Panel className="mb-6" aria-label="Meetings" data-testid="my-day-meetings">
          <PanelHeader title="Meetings" meta={`Today ${todays.length} · Next 7 days ${later.length}`} />
          <ul className="divide-y divide-line">
            {[...todays, ...later].map((m) => {
              const link = meetingLink(m.location);
              const who = ownerName(m.ownerId);
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link href={`/leads/${m.leadId}`} className="block truncate text-body text-ink hover:underline">
                      {m.contact ? `${m.contact} · ${m.company}` : m.company}
                    </Link>
                    <p className="truncate text-small text-ink-muted">
                      {formatDualZone(m.startsAt, m.timezone, profile.timezone)} · {m.durationMin} min
                      {who && ` · ${who}`}
                    </p>
                  </div>
                  {now && isToday(m) && (
                    <span className="num text-small text-warn-ink">{formatCountdown(m.startsAt, now)}</span>
                  )}
                  {link && (
                    <Button asChild size="sm" variant="secondary">
                      <a href={link} target="_blank" rel="noreferrer">
                        <Video aria-hidden /> Join
                      </a>
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </>
  );
}
