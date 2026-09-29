"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/common/form-field";
import { TimezoneSelect } from "@/components/common/timezone-select";
import { formatDualZone, localDateTimeToUtc, isValidTimeZone } from "@/lib/dates";
import { DURATION_CHOICES, MAX_REMINDERS, REMINDER_CHOICES, type MeetingValues } from "@/lib/validation/meeting";

export type MeetingErrors = Partial<Record<keyof MeetingValues, string>>;
export type CalendarStatus = "not_connected" | "active" | "needs_reconnect" | null;

const chip = (on: boolean) =>
  cn(
    "h-7 rounded-md border px-2.5 text-small transition-colors disabled:opacity-50",
    on
      ? "border-accent-strong bg-accent-soft text-accent-strong"
      : "border-line bg-surface text-ink hover:bg-surface-muted",
  );

/** The meeting part of Log activity (Meeting booked) and of Reschedule (docs/10 section 4). */
export function MeetingFields({
  idPrefix,
  value,
  onChange,
  errors,
  viewerTz,
  contactEmail,
  calendar,
}: {
  idPrefix: string;
  value: MeetingValues;
  onChange: (patch: Partial<MeetingValues>) => void;
  errors: MeetingErrors;
  viewerTz: string;
  contactEmail: string | null;
  calendar: CalendarStatus;
}) {
  const id = (k: string) => `${idPrefix}-${k}`;
  const at =
    value.startsAt && isValidTimeZone(value.timezone) ? localDateTimeToUtc(value.startsAt, value.timezone) : null;
  const reminders = value.reminders ?? [];
  const toggleReminder = (m: number) =>
    onChange({
      reminders: reminders.includes(m) ? reminders.filter((x) => x !== m) : [...reminders, m].slice(-MAX_REMINDERS),
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Date and time" htmlFor={id("start")} required error={errors.startsAt}>
          <Input
            id={id("start")}
            type="datetime-local"
            value={value.startsAt}
            aria-invalid={!!errors.startsAt}
            onChange={(e) => onChange({ startsAt: e.target.value })}
          />
        </FormField>
        <FormField label="Time zone" htmlFor={id("tz")} required error={errors.timezone}>
          <TimezoneSelect
            id={id("tz")}
            value={value.timezone}
            onChange={(tz) => onChange({ timezone: tz })}
            invalid={!!errors.timezone}
            showPreview={false}
          />
        </FormField>
      </div>
      {at && (
        <p className="-mt-2 text-small text-ink-muted" data-testid="meeting-when">
          {formatDualZone(at, value.timezone, viewerTz)}
        </p>
      )}

      <FormField label="Duration" htmlFor={id("duration")} error={errors.durationMin}>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Duration">
          {DURATION_CHOICES.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={value.durationMin === d}
              className={chip(value.durationMin === d)}
              onClick={() => onChange({ durationMin: d })}
            >
              {d} min
            </button>
          ))}
          <Input
            id={id("duration")}
            type="number"
            inputMode="numeric"
            min={5}
            max={480}
            className="h-7 w-20 num"
            aria-label="Minutes"
            value={Number.isFinite(value.durationMin) ? value.durationMin : ""}
            onChange={(e) => onChange({ durationMin: e.target.value === "" ? Number.NaN : Number(e.target.value) })}
          />
        </div>
      </FormField>

      <FormField label="Location or link" htmlFor={id("location")} error={errors.location}>
        <Input
          id={id("location")}
          placeholder="https://meet.google.com/… or an address"
          value={value.location ?? ""}
          onChange={(e) => onChange({ location: e.target.value })}
        />
      </FormField>
      <FormField label="Agenda" htmlFor={id("agenda")} error={errors.agenda} helper="Goes into the calendar event.">
        <Textarea
          id={id("agenda")}
          rows={2}
          value={value.agenda ?? ""}
          onChange={(e) => onChange({ agenda: e.target.value })}
        />
      </FormField>

      <FormField
        label="Reminders"
        htmlFor={id("reminders")}
        error={errors.reminders}
        helper="Before the meeting, in the app and in Google Calendar."
      >
        <div id={id("reminders")} className="flex flex-wrap gap-1.5" role="group" aria-label="Reminders">
          {REMINDER_CHOICES.map((r) => (
            <button
              key={r.minutes}
              type="button"
              aria-pressed={reminders.includes(r.minutes)}
              className={chip(reminders.includes(r.minutes))}
              onClick={() => toggleReminder(r.minutes)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </FormField>

      {calendar === "active" && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-body text-ink">
            <Checkbox
              checked={value.addToCalendar ?? true}
              onCheckedChange={(v) => onChange({ addToCalendar: !!v, ...(v ? {} : { inviteContact: false }) })}
            />
            Add to my Google Calendar
          </label>
          {contactEmail && (value.addToCalendar ?? true) && (
            <label className="flex items-center gap-2 text-body text-ink">
              <Checkbox checked={!!value.inviteContact} onCheckedChange={(v) => onChange({ inviteContact: !!v })} />
              Send a Google invite to {contactEmail}
            </label>
          )}
        </div>
      )}
      {calendar === "not_connected" && (
        <p className="text-small text-ink-muted">
          <Link href="/profile#google-calendar" className="text-accent-strong hover:underline">
            Connect Google Calendar
          </Link>{" "}
          to add meetings to your calendar.
        </p>
      )}
      {calendar === "needs_reconnect" && (
        <p className="text-small text-warn">
          Google Calendar needs a reconnect.{" "}
          <Link href="/profile#google-calendar" className="underline">
            Reconnect
          </Link>
        </p>
      )}
    </div>
  );
}
