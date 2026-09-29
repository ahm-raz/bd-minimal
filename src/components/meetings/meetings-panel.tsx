"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, CalendarX, MoreHorizontal, RefreshCw, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Chip, type Tone } from "@/components/common/chips";
import { FormField } from "@/components/common/form-field";
import { Panel, PanelHeader } from "@/components/common/page";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { formatCountdown, formatDualZone, toLocalDateTimeInput } from "@/lib/dates";
import type { Tables } from "@/lib/domain";
import { useNow } from "@/lib/use-now";
import { meetingLink, type MeetingValues } from "@/lib/validation/meeting";
import { moveOpportunityStage } from "@/server/actions/opportunities";
import { cancelMeeting, rescheduleMeeting, retryMeetingSync, setMeetingStatus } from "@/server/actions/meetings";
import { MeetingFields, type CalendarStatus, type MeetingErrors } from "./meeting-fields";

type Meeting = Tables<"meetings">;

const STATUS: Record<Meeting["status"], { label: string; tone: Tone }> = {
  scheduled: { label: "Scheduled", tone: "accent" },
  held: { label: "Held", tone: "ok" },
  no_show: { label: "No-show", tone: "warn" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

export function MeetingStatusChip({ status }: { status: Meeting["status"] }) {
  return <Chip tone={STATUS[status].tone}>{STATUS[status].label}</Chip>;
}

/** Calendar sync chip (docs/10 section 2). Nothing when the meeting was never meant for Google. */
export function CalendarChip({
  meeting,
  onRetry,
}: {
  meeting: Pick<Meeting, "gcal_state" | "status" | "gcal_error">;
  onRetry?: () => void;
}) {
  if (meeting.status === "cancelled") return null;
  switch (meeting.gcal_state) {
    case "synced":
      return (
        <Chip tone="ok">
          <CalendarCheck className="size-3" aria-hidden /> In your calendar
        </Chip>
      );
    case "pending":
      return <Chip tone="neutral">Syncing…</Chip>;
    case "failed":
      return (
        <button type="button" onClick={onRetry} title={meeting.gcal_error ?? undefined} className="inline-flex">
          <Chip tone="bad">
            <RefreshCw className="size-3" aria-hidden /> Calendar failed · Retry
          </Chip>
        </button>
      );
    case "removed_in_google":
      return (
        <button type="button" onClick={onRetry} className="inline-flex">
          <Chip tone="warn">
            <CalendarX className="size-3" aria-hidden /> Removed from your calendar · Add again
          </Chip>
        </button>
      );
    default:
      return null;
  }
}

/** Lead page → Meetings (docs/10 section 4). */
export function MeetingsPanel({
  leadId,
  companyName,
  meetings,
  contacts,
  openOpportunities,
  calendar,
}: {
  leadId: string;
  companyName: string;
  meetings: Meeting[];
  contacts: Tables<"contacts">[];
  openOpportunities: { id: string; title: string; stage_key: string }[];
  calendar: CalendarStatus;
}) {
  const now = useNow();
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [cancelling, setCancelling] = useState<Meeting | null>(null);
  const [moveOffer, setMoveOffer] = useState<{ opp: { id: string; title: string }; meeting: Meeting } | null>(null);
  const { openLogActivity } = useApp();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const nowMs = now?.getTime() ?? 0;
  const upcoming = meetings
    .filter((m) => m.status === "scheduled")
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = meetings.filter((m) => m.status !== "scheduled");
  const rows = [...upcoming, ...past];

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "That didn't work. Try again.");
        return;
      }
      toast.success(success);
      router.refresh();
      after?.();
    });

  const markHeld = (m: Meeting) =>
    run(
      () => setMeetingStatus({ id: m.id, status: "held" }),
      "Meeting marked held",
      () => {
        const opp =
          openOpportunities.length === 1 && openOpportunities[0]!.stage_key === "qualified"
            ? openOpportunities[0]!
            : null;
        if (opp) setMoveOffer({ opp, meeting: m });
        else openLogActivity({ leadId, contactId: m.contact_id });
      },
    );

  return (
    <Panel data-testid="meetings-panel">
      <PanelHeader title="Meetings" meta={upcoming.length ? `${upcoming.length} upcoming` : undefined} />
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-small text-ink-muted">No meetings yet. Log a Meeting booked outcome to add one.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((m) => {
            const link = meetingLink(m.location);
            const soon = m.status === "scheduled" && now && new Date(m.starts_at).getTime() - nowMs < 86_400_000;
            return (
              <li key={m.id} className="flex flex-col gap-1.5 px-4 py-3" data-testid={`meeting-${m.id}`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body text-ink">{m.title}</p>
                    <p className="text-small text-ink-muted">
                      <MeetingWhen meeting={m} /> · {m.duration_min} min
                      {soon && now && <span className="text-ink"> · {formatCountdown(m.starts_at, now)}</span>}
                    </p>
                  </div>
                  {link && m.status === "scheduled" && (
                    <Button asChild size="sm" variant="secondary">
                      <a href={link} target="_blank" rel="noreferrer">
                        <Video aria-hidden /> Join
                      </a>
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Meeting actions for ${m.title}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {m.status === "scheduled" ? (
                        <>
                          <DropdownMenuItem onSelect={() => setEditing(m)}>Reschedule</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => markHeld(m)}>Mark held</DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              run(
                                () => setMeetingStatus({ id: m.id, status: "no_show" }),
                                "Marked as no-show",
                                () => openLogActivity({ leadId, contactId: m.contact_id }),
                              )
                            }
                          >
                            No-show
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-bad" onSelect={() => setCancelling(m)}>
                            Cancel meeting
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem
                          onSelect={() =>
                            run(() => setMeetingStatus({ id: m.id, status: "scheduled" }), "Meeting is scheduled again")
                          }
                        >
                          Undo {STATUS[m.status].label.toLowerCase()}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <MeetingStatusChip status={m.status} />
                  <CalendarChip
                    meeting={m}
                    onRetry={() => run(() => retryMeetingSync({ id: m.id }), "Added to your calendar")}
                  />
                  {m.status_note && <span className="truncate text-small text-ink-muted">{m.status_note}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <RescheduleDialog
          meeting={editing}
          contactEmail={contacts.find((c) => c.id === editing.contact_id)?.email ?? null}
          calendar={calendar}
          onClose={() => setEditing(null)}
        />
      )}
      {cancelling && (
        <CancelDialog meeting={cancelling} companyName={companyName} onClose={() => setCancelling(null)} />
      )}
      {moveOffer && (
        <Dialog
          open
          onOpenChange={(o) =>
            !o && (setMoveOffer(null), openLogActivity({ leadId, contactId: moveOffer.meeting.contact_id }))
          }
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move {moveOffer.opp.title} to Meeting done?</DialogTitle>
              <DialogDescription>The meeting is marked held. Next, log how it went.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  const m = moveOffer.meeting;
                  setMoveOffer(null);
                  openLogActivity({ leadId, contactId: m.contact_id });
                }}
              >
                Not now
              </Button>
              <Button
                onClick={() => {
                  const { opp, meeting } = moveOffer;
                  setMoveOffer(null);
                  run(
                    () => moveOpportunityStage({ id: opp.id, stage: "meeting_done" }),
                    "Moved to Meeting done",
                    () => openLogActivity({ leadId, contactId: meeting.contact_id }),
                  );
                }}
              >
                Move to Meeting done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Panel>
  );
}

export function MeetingWhen({ meeting }: { meeting: Pick<Meeting, "starts_at" | "timezone"> }) {
  const profile = useProfile();
  return (
    <span data-testid="meeting-time">{formatDualZone(meeting.starts_at, meeting.timezone, profile.timezone)}</span>
  );
}

function RescheduleDialog({
  meeting,
  contactEmail,
  calendar,
  onClose,
}: {
  meeting: Meeting;
  contactEmail: string | null;
  calendar: CalendarStatus;
  onClose: () => void;
}) {
  const profile = useProfile();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<MeetingErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [value, setValue] = useState<MeetingValues>({
    startsAt: toLocalDateTimeInput(meeting.starts_at, meeting.timezone),
    timezone: meeting.timezone,
    durationMin: meeting.duration_min,
    location: meeting.location ?? "",
    agenda: meeting.agenda ?? "",
    reminders: meeting.reminder_minutes,
    addToCalendar: meeting.add_to_calendar,
    inviteContact: meeting.invite_contact,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reschedule meeting</DialogTitle>
          <DialogDescription>{meeting.title}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              setFormError(null);
              const res = await rescheduleMeeting({ id: meeting.id, ...value });
              if (!res.ok) {
                setErrors((res.fieldErrors ?? {}) as MeetingErrors);
                setFormError(res.fieldErrors ? null : res.error);
                return;
              }
              toast.success("Meeting updated");
              router.refresh();
              onClose();
            });
          }}
        >
          {formError && (
            <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">
              {formError}
            </p>
          )}
          <MeetingFields
            idPrefix="edit-meeting"
            value={value}
            onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
            errors={errors}
            viewerTz={profile.timezone}
            contactEmail={contactEmail}
            calendar={calendar}
          />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Save meeting
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  meeting,
  companyName,
  onClose,
}: {
  meeting: Meeting;
  companyName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel the meeting with {companyName}?</DialogTitle>
          <DialogDescription>It&apos;s removed from your Google Calendar. You can undo this later.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await cancelMeeting({ id: meeting.id, reason });
              if (!res.ok) {
                setError(res.fieldErrors?.reason ?? res.error);
                return;
              }
              toast.success("Meeting cancelled");
              router.refresh();
              onClose();
            });
          }}
        >
          <FormField label="Reason" htmlFor="cancel-reason" required error={error ?? undefined}>
            <Textarea
              id="cancel-reason"
              rows={2}
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={!!error}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Keep meeting
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              Cancel meeting
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
