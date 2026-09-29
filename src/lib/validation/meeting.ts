import { z } from "zod";
import { isValidTimeZone, localDateTimeToUtc } from "@/lib/dates";

/**
 * Meeting fields (docs/10 sections 1 and 4). One schema for the Log activity form, the reschedule
 * dialog and the server actions. Times are typed in the meeting's own time zone.
 */

export const DURATION_CHOICES = [15, 30, 45, 60] as const;
export const REMINDER_CHOICES = [
  { minutes: 10, label: "10 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 1440, label: "1 day" },
] as const;
export const DEFAULT_REMINDERS = [30, 10];
export const MAX_REMINDERS = 5;
/** Google's limit for a popup reminder: 4 weeks. */
export const MAX_REMINDER_MINUTES = 40320;

export const meetingFields = z.object({
  /** "yyyy-MM-ddTHH:mm" in `timezone` */
  startsAt: z.string(),
  timezone: z.string(),
  durationMin: z.number(),
  location: z.string().trim().max(300, "Keep the location under 300 characters.").optional().default(""),
  agenda: z.string().trim().max(2000, "Keep the agenda under 2,000 characters.").optional().default(""),
  reminders: z.array(z.number()).optional().default(DEFAULT_REMINDERS),
  addToCalendar: z.boolean().optional().default(true),
  inviteContact: z.boolean().optional().default(false),
});
export type MeetingValues = z.input<typeof meetingFields>;

export type MeetingData = {
  startsAtUtc: string;
  timezone: string;
  durationMin: number;
  location: string | null;
  agenda: string | null;
  reminders: number[];
  addToCalendar: boolean;
  inviteContact: boolean;
};

type Issue = (path: string, message: string) => void;

/**
 * Check meeting values; reports issues under `prefix` (e.g. "meeting.startsAt").
 * "book": the time must be in the future. "edit": up to 1 day back is allowed (corrections).
 */
export function checkMeeting(
  v: z.output<typeof meetingFields>,
  issue: Issue,
  { now = new Date(), mode = "book", prefix = "" }: { now?: Date; mode?: "book" | "edit"; prefix?: string } = {},
): MeetingData | null {
  const p = (k: string) => (prefix ? `${prefix}.${k}` : k);
  let okay = true;
  const bad = (k: string, m: string) => {
    okay = false;
    issue(p(k), m);
  };

  const tzOk = !!v.timezone && isValidTimeZone(v.timezone);
  if (!tzOk) bad("timezone", "Pick a time zone from the list.");
  const at = v.startsAt && tzOk ? localDateTimeToUtc(v.startsAt, v.timezone) : null;
  if (!v.startsAt || (tzOk && !at)) bad("startsAt", "Pick a date and time.");
  else if (at) {
    const earliest = mode === "book" ? now.getTime() : now.getTime() - 86_400_000;
    if (at.getTime() <= earliest)
      bad("startsAt", mode === "book" ? "Pick a time in the future." : "Pick a time from yesterday on.");
    else if (at.getTime() > now.getTime() + 365 * 86_400_000) bad("startsAt", "Pick a time within the next year.");
  }
  if (!Number.isInteger(v.durationMin) || v.durationMin < 5 || v.durationMin > 480) {
    bad("durationMin", "Use a duration from 5 to 480 minutes.");
  }
  const reminders = [...new Set(v.reminders)].sort((a, b) => b - a);
  if (reminders.length > MAX_REMINDERS) bad("reminders", "Pick up to 5 reminders.");
  else if (reminders.some((m) => !Number.isInteger(m) || m < 0 || m > MAX_REMINDER_MINUTES)) {
    bad("reminders", "Reminders can be up to 4 weeks before.");
  }
  if (!okay || !at) return null;
  return {
    startsAtUtc: at.toISOString(),
    timezone: v.timezone,
    durationMin: v.durationMin,
    location: v.location || null,
    agenda: v.agenda || null,
    reminders,
    addToCalendar: v.addToCalendar,
    inviteContact: v.inviteContact,
  };
}

/** Reschedule or edit a meeting (lead page). */
export function makeEditMeetingSchema({ now = () => new Date() }: { now?: () => Date } = {}) {
  return meetingFields.extend({ id: z.uuid() }).transform((v, ctx) => {
    const data = checkMeeting(v, (path, message) => ctx.addIssue({ code: "custom", path: [path], message }), {
      now: now(),
      mode: "edit",
    });
    return { id: v.id, ...(data ?? ({} as MeetingData)) };
  });
}
export type EditMeetingValues = z.input<ReturnType<typeof makeEditMeetingSchema>>;

export const cancelMeetingSchema = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(1, "Say why it was cancelled.").max(500, "Keep the reason under 500 characters."),
});
export type CancelMeetingValues = z.input<typeof cancelMeetingSchema>;

/** "https://…" links get a Join button. */
export function meetingLink(location: string | null | undefined): string | null {
  if (!location) return null;
  const m = /^https?:\/\/\S+$/i.exec(location.trim());
  return m ? m[0] : null;
}

/** "1 hour", "30 min", "1 day", "2 days". */
export function reminderLabel(minutes: number): string {
  const preset = REMINDER_CHOICES.find((r) => r.minutes === minutes);
  if (preset) return preset.label;
  if (minutes % 1440 === 0) return `${minutes / 1440} days`;
  if (minutes % 60 === 0) return `${minutes / 60} hours`;
  return `${minutes} min`;
}
