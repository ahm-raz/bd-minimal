import { z } from "zod";
import type { ActivityCategory } from "@/lib/domain";
import { isLocalDate, localDateTimeToUtc, MAX_BACKDATE_DAYS } from "@/lib/dates";
import { checkMeeting, meetingFields, type MeetingData } from "@/lib/validation/meeting";

/**
 * Log activity form (docs/04 section 3; docs/07 section 6). One schema for form and server action.
 * The factory needs the activity types and outcomes so the form never offers (or accepts)
 * an outcome the database would reject.
 */

export type ActivityTypeRef = { id: string; category: ActivityCategory; name: string };
export type OutcomeRef = { key: string; allowed_categories: ActivityCategory[] };

/** The outcome that books a meeting (docs/10 section 1). */
export const MEETING_OUTCOME = "meeting_booked";

/** Outcomes that don't need a next action. */
export const NO_NEXT_ACTION_OUTCOMES = ["not_interested", "bounced"];

/** Default outcome per category: outreach/follow-up → No response; reply → Interested; meeting/proposal → Done. */
export function defaultOutcome(category: ActivityCategory, allowed: string[]): string {
  const preferred: Record<ActivityCategory, string> = {
    outreach: "no_response",
    follow_up: "no_response",
    inbound_reply: "interested",
    call: "no_response",
    meeting: "done",
    proposal: "done",
    other: "done",
  };
  const want = preferred[category];
  return allowed.includes(want) ? want : (allowed[0] ?? "");
}

export function outcomesFor(category: ActivityCategory | undefined, outcomes: OutcomeRef[]): OutcomeRef[] {
  if (!category) return [];
  return outcomes.filter((o) => o.allowed_categories.includes(category));
}

export const logActivityFields = z.object({
  leadId: z.uuid(),
  activityTypeId: z.string().min(1, "Pick a type."),
  outcomeKey: z.string().min(1, "Pick an outcome."),
  contactId: z.string().nullable().optional(),
  /** "yyyy-MM-ddTHH:mm" in the viewer's time zone */
  occurredAt: z.string().min(1, "Pick when it happened."),
  notes: z.string().trim().max(5000, "Keep notes under 5,000 characters.").optional().default(""),
  nextAction: z.string().trim().max(200, "Keep the next action under 200 characters.").optional().default(""),
  nextActionDue: z.string().nullable().optional().default(null),
  noNextStep: z.boolean().optional().default(false),
  opportunityId: z.string().nullable().optional(),
  /** Required when the outcome is Meeting booked. */
  meeting: meetingFields.optional(),
});
export type LogActivityValues = z.input<typeof logActivityFields>;

export type LogActivityData = {
  leadId: string;
  activityTypeId: string;
  outcomeKey: string;
  contactId: string | null;
  occurredAtUtc: string;
  notes: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  clearNextAction: boolean;
  opportunityId: string | null;
  /** Set for Meeting booked; the database then sets the next action to the meeting. */
  meeting: MeetingData | null;
};

export function makeLogActivitySchema({
  types,
  outcomes,
  timezone,
  now = () => new Date(),
}: {
  types: ActivityTypeRef[];
  outcomes: OutcomeRef[];
  timezone: string;
  now?: () => Date;
}) {
  return logActivityFields.transform((v, ctx): LogActivityData => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    const type = types.find((t) => t.id === v.activityTypeId);
    if (!type) issue("activityTypeId", "Pick a type.");
    const outcome = outcomes.find((o) => o.key === v.outcomeKey);
    if (type && (!outcome || !outcome.allowed_categories.includes(type.category))) {
      issue("outcomeKey", "Pick one of the outcomes offered for this type.");
    }

    const at = localDateTimeToUtc(v.occurredAt, timezone);
    const current = now();
    if (!at) issue("occurredAt", "Pick a date and time.");
    else if (at.getTime() > current.getTime() + 5 * 60_000) issue("occurredAt", "It can't be in the future.");
    else if (current.getTime() - at.getTime() > MAX_BACKDATE_DAYS * 86_400_000) {
      issue("occurredAt", `You can backdate up to ${MAX_BACKDATE_DAYS} days.`);
    }

    const booking = v.outcomeKey === MEETING_OUTCOME;
    let meeting: MeetingData | null = null;
    if (booking) {
      if (!v.meeting) issue("meeting.startsAt", "Pick a date and time.");
      else meeting = checkMeeting(v.meeting, issue, { now: current, mode: "book", prefix: "meeting" });
    }

    const optional = v.noNextStep || NO_NEXT_ACTION_OUTCOMES.includes(v.outcomeKey);
    const hasAction = v.nextAction !== "" || !!v.nextActionDue;
    if (!booking && !v.noNextStep && (hasAction || !optional)) {
      if (!v.nextAction) issue("nextAction", "Say what the next step is, or tick No next step.");
      if (!v.nextActionDue) issue("nextActionDue", "Pick a due date.");
      else if (!isLocalDate(v.nextActionDue)) issue("nextActionDue", "Pick a date.");
    }

    const setNext = !booking && !v.noNextStep && !!v.nextAction && !!v.nextActionDue;
    return {
      leadId: v.leadId,
      activityTypeId: v.activityTypeId,
      outcomeKey: v.outcomeKey,
      contactId: v.contactId || null,
      occurredAtUtc: at ? at.toISOString() : "",
      notes: v.notes || null,
      nextAction: setNext ? v.nextAction : null,
      nextActionDue: setNext ? v.nextActionDue : null,
      clearNextAction: !booking && !setNext,
      opportunityId: v.opportunityId || null,
      meeting,
    };
  });
}

/** Editing an activity: notes, outcome and time (BDs: own, within 24 hours). */
export const editActivityFields = z.object({
  id: z.uuid(),
  outcomeKey: z.string().min(1, "Pick an outcome."),
  occurredAt: z.string().min(1, "Pick when it happened."),
  notes: z.string().trim().max(5000, "Keep notes under 5,000 characters.").optional().default(""),
});
export type EditActivityValues = z.input<typeof editActivityFields>;

export const BD_EDIT_WINDOW_MS = 24 * 3600 * 1000;
