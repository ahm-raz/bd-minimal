"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, Panel, PanelHeader } from "@/components/common/page";
import { MyDayMeetings } from "@/components/meetings/my-day-meetings";
import type { CalendarStatus } from "@/components/meetings/meeting-fields";
import type { UpcomingMeeting } from "@/server/queries/meetings";
import { PaceBar } from "@/components/common/pace-bar";
import { DrilldownSheet, type DrillRequest } from "@/components/metrics/drilldown-sheet";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { METRIC_LABELS, type TargetMetric } from "@/lib/domain";
import { dueLabel, formatLocalDate } from "@/lib/dates";
import { dailyTarget, dayPaceMarker } from "@/lib/metrics";
import { formatNumber } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import type { DrillMetric } from "@/server/actions/drilldown";
import type { FollowUp, MyDayData } from "@/server/queries/my-day";
import type { TaskItem } from "@/server/queries/tasks";
import { MyDayTasks } from "./my-day-tasks";
import { FounderSocialBlocks } from "./social-day";
import type { PostItem } from "@/server/queries/content";

const BAR_METRICS = ["leads_added", "outreach", "follow_ups"] as const satisfies readonly TargetMetric[];
const SHORT: Partial<Record<TargetMetric, string>> = {
  leads_added: "Leads",
  outreach: "Outreach",
  follow_ups: "Follow-ups",
};

export function MyDayView({
  data,
  tasks,
  founderName,
  social,
  meetings,
  calendar,
}: {
  data: MyDayData;
  tasks: TaskItem[];
  founderName: string;
  /** Founder only: review queue and today's posts (docs/09 section 4). */
  social?: { review: PostItem[]; todayPosts: PostItem[] } | null;
  meetings: UpcomingMeeting[];
  calendar: CalendarStatus;
}) {
  const { openNewLead } = useApp();
  const profile = useProfile();
  const now = useNow();
  const [drill, setDrill] = useState<DrillRequest | null>(null);
  const [showComing, setShowComing] = useState(false);

  const open = (metric: DrillMetric, label: string) =>
    setDrill({
      metric,
      label: `${label} today`,
      fromUtc: data.range.fromUtc,
      toUtc: data.range.toUtc,
      userId: profile.id,
    });

  const overdue = data.followUps.filter((f) => f.due < data.today);
  const dueToday = data.followUps.filter((f) => f.due === data.today);

  return (
    <>
      <PageHeader
        title="My Day"
        meta={<span data-testid="today">{formatLocalDate(data.today)}</span>}
        actions={
          <Button onClick={() => openNewLead()}>
            <Plus aria-hidden /> Lead <kbd className="ml-1 font-mono text-micro font-normal opacity-80">N</kbd>
          </Button>
        }
      />

      <Panel className="mb-6" aria-label="Today so far">
        <PanelHeader title="Today so far" />
        <div className="grid gap-x-8 gap-y-5 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {BAR_METRICS.map((m) => {
            const weekly = data.targets[m];
            const actual = data.counts[m];
            if (weekly === undefined) {
              return (
                <CountButton
                  key={m}
                  label={METRIC_LABELS[m]}
                  value={actual}
                  onClick={() => open(m, METRIC_LABELS[m])}
                />
              );
            }
            const daily = dailyTarget(weekly);
            return (
              <button
                key={m}
                type="button"
                onClick={() => open(m, METRIC_LABELS[m])}
                className="rounded-md p-1 text-left transition-colors hover:bg-surface-muted"
                data-testid={`counter-${m}`}
              >
                <PaceBar
                  label={SHORT[m]}
                  actual={actual}
                  target={daily}
                  pace={now ? dayPaceMarker(daily, profile.timezone, now) : null}
                />
                <span className="sr-only">Show the list</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-line px-4 py-3">
          <CountButton label="Replies" value={data.counts.replies} onClick={() => open("replies", "Replies")} inline />
          <CountButton
            label="Meetings booked"
            value={data.counts.meetings_booked}
            onClick={() => open("meetings_booked", "Meetings booked")}
            inline
          />
          {data.targets.proposals_sent !== undefined && (
            <CountButton
              label="Proposals sent"
              value={data.counts.proposals_sent}
              onClick={() => open("proposals_sent", "Proposals sent")}
              inline
            />
          )}
        </div>
      </Panel>

      <MyDayMeetings meetings={meetings} calendar={calendar} />

      <MyDayTasks today={data.today} tasks={tasks} founderName={founderName} />

      {social && <FounderSocialBlocks review={social.review} todayPosts={social.todayPosts} />}

      <Panel aria-label="Follow-ups">
        <PanelHeader
          title="Follow-ups"
          meta={
            <span className="num">
              <span className={cn(overdue.length > 0 && "text-bad")}>Overdue {overdue.length}</span>
              <span className="ml-3">Today {dueToday.length}</span>
            </span>
          }
        />
        {data.followUps.length === 0 ? (
          <EmptyState
            action={
              <Button variant="secondary" asChild>
                <Link href="/leads">Open leads</Link>
              </Button>
            }
          >
            Nothing due today. Open Leads and plan next steps for new leads.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line" data-testid="follow-ups">
            {data.followUps.map((f) => (
              <FollowUpRow key={f.leadId} f={f} today={data.today} />
            ))}
          </ul>
        )}
        <div className="border-t border-line">
          <button
            type="button"
            aria-expanded={showComing}
            onClick={() => setShowComing((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-section text-ink hover:bg-surface-muted"
          >
            <ChevronDown
              className={cn("size-4 text-ink-muted transition-transform", !showComing && "-rotate-90")}
              aria-hidden
            />
            Coming up
            <span className="num text-small font-normal text-ink-muted">{data.comingUp.length}</span>
          </button>
          {showComing &&
            (data.comingUp.length === 0 ? (
              <p className="px-4 pb-4 text-small text-ink-muted">Nothing planned for the next 7 days.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line" data-testid="coming-up">
                {data.comingUp.map((f) => (
                  <FollowUpRow key={f.leadId} f={f} today={data.today} />
                ))}
              </ul>
            ))}
        </div>
      </Panel>

      <DrilldownSheet request={drill} onClose={() => setDrill(null)} />
    </>
  );
}

function CountButton({
  label,
  value,
  onClick,
  inline,
}: {
  label: string;
  value: number;
  onClick: () => void;
  inline?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md p-1 text-left transition-colors hover:bg-surface-muted",
        inline && "inline-flex items-baseline gap-2",
      )}
    >
      <span className="text-small text-ink-muted">{label}</span>
      <span className={cn("num text-ink", inline ? "text-body font-medium" : "block text-section")}>
        {formatNumber(value)}
      </span>
      <span className="sr-only">Show the list</span>
    </button>
  );
}

/** "Yesterday" → "yesterday" after "Due"; dates and weekdays stay as they are. */
function lowerRelative(label: string) {
  return ["Today", "Yesterday", "Tomorrow"].includes(label) ? label.toLowerCase() : label;
}

function FollowUpRow({ f, today }: { f: FollowUp; today: string }) {
  const { openLogActivity } = useApp();
  const state = f.due < today ? "overdue" : f.due === today ? "today" : "upcoming";
  return (
    <li
      tabIndex={0}
      data-lead-id={f.leadId}
      data-contact-id={f.contactId ?? undefined}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 outline-none hover:bg-surface-muted focus-visible:bg-accent-soft"
      data-testid={`follow-up-${f.company}`}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          state === "overdue" ? "bg-bad" : state === "today" ? "bg-warn" : "bg-line",
        )}
      />
      <span className="w-40 min-w-0 truncate font-medium text-ink">{f.contact ?? "No contact"}</span>
      <Link href={`/leads/${f.leadId}`} className="w-52 min-w-0 truncate text-ink hover:underline">
        {f.company}
      </Link>
      <span className="min-w-0 flex-1 truncate text-ink-muted">{f.nextAction}</span>
      <span
        className={cn(
          "w-32 text-right num text-small",
          state === "overdue" ? "text-bad" : state === "today" ? "text-warn" : "text-ink-muted",
        )}
      >
        {state === "upcoming" ? dueLabel(f.due, today) : `Due ${lowerRelative(dueLabel(f.due, today))}`}
      </span>
      <Button
        size="sm"
        variant="secondary"
        aria-label={`Log activity for ${f.company}`}
        onClick={() => openLogActivity({ leadId: f.leadId, contactId: f.contactId })}
      >
        Log
      </Button>
    </li>
  );
}
