import { describe, expect, it } from "vitest";
import { makeLogActivitySchema, type OutcomeRef } from "@/lib/validation/activity";
import {
  checkMeeting,
  makeEditMeetingSchema,
  meetingFields,
  meetingLink,
  reminderLabel,
} from "@/lib/validation/meeting";

const T = { reply: { id: "t-reply", category: "inbound_reply" as const, name: "Reply received" } };
const OUTCOMES: OutcomeRef[] = [
  { key: "interested", allowed_categories: ["inbound_reply"] },
  { key: "meeting_booked", allowed_categories: ["inbound_reply"] },
];
const NOW = new Date("2026-09-29T12:00:00Z"); // 17:00 Karachi, 07:00 Chicago
const schema = makeLogActivitySchema({
  types: [T.reply],
  outcomes: OUTCOMES,
  timezone: "Asia/Karachi",
  now: () => NOW,
});
const LEAD = "11111111-1111-4111-8111-111111111111";

const meeting = { startsAt: "2026-10-06T10:00", timezone: "America/Chicago", durationMin: 30, reminders: [30, 10] };
const booking = {
  leadId: LEAD,
  activityTypeId: T.reply.id,
  outcomeKey: "meeting_booked",
  occurredAt: "2026-09-29T16:55",
  meeting,
};

function errors(input: object) {
  const r = schema.safeParse(input);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("booking a meeting from Log activity (docs/10 section 1)", () => {
  it("stores the time in UTC from the meeting's own zone, and skips the next-action fields", () => {
    const r = schema.parse(booking);
    // 10:00 CDT (UTC-5) on 6 Oct
    expect(r.meeting?.startsAtUtc).toBe("2026-10-06T15:00:00.000Z");
    expect(r.meeting?.reminders).toEqual([30, 10]);
    expect(r.nextAction).toBeNull();
    expect(r.clearNextAction).toBe(false);
  });

  it("needs the meeting time", () => {
    expect(errors({ ...booking, meeting: undefined })).toEqual({ "meeting.startsAt": "Pick a date and time." });
    expect(errors({ ...booking, meeting: { ...meeting, startsAt: "" } })).toEqual({
      "meeting.startsAt": "Pick a date and time.",
    });
  });

  it("rejects the past, bad zones, durations and too many reminders", () => {
    expect(errors({ ...booking, meeting: { ...meeting, startsAt: "2026-09-29T06:00" } })).toEqual({
      "meeting.startsAt": "Pick a time in the future.",
    });
    expect(errors({ ...booking, meeting: { ...meeting, timezone: "Mars/Base" } })).toEqual({
      "meeting.timezone": "Pick a time zone from the list.",
    });
    expect(errors({ ...booking, meeting: { ...meeting, durationMin: 2 } })).toEqual({
      "meeting.durationMin": "Use a duration from 5 to 480 minutes.",
    });
    expect(errors({ ...booking, meeting: { ...meeting, reminders: [1, 2, 3, 4, 5, 6] } })).toEqual({
      "meeting.reminders": "Pick up to 5 reminders.",
    });
    expect(errors({ ...booking, meeting: { ...meeting, reminders: [50000] } })).toEqual({
      "meeting.reminders": "Reminders can be up to 4 weeks before.",
    });
    expect(errors({ ...booking, meeting: { ...meeting, startsAt: "2027-10-30T10:00" } })).toEqual({
      "meeting.startsAt": "Pick a time within the next year.",
    });
  });

  it("other outcomes ignore the meeting and still need a next action", () => {
    const e = errors({ ...booking, outcomeKey: "interested" });
    expect(e).toEqual({
      nextAction: "Say what the next step is, or tick No next step.",
      nextActionDue: "Pick a due date.",
    });
    expect(schema.parse({ ...booking, outcomeKey: "interested", noNextStep: true }).meeting).toBeNull();
  });
});

describe("meeting times across daylight saving", () => {
  const check = (startsAt: string, timezone: string) =>
    checkMeeting(meetingFields.parse({ ...meeting, startsAt, timezone }), () => undefined, {
      now: new Date("2026-10-01T00:00:00Z"),
    })?.startsAtUtc;
  it("uses the offset in force on the meeting day", () => {
    expect(check("2026-10-30T09:00", "America/New_York")).toBe("2026-10-30T13:00:00.000Z"); // EDT
    expect(check("2026-11-02T09:00", "America/New_York")).toBe("2026-11-02T14:00:00.000Z"); // EST after 1 Nov
    expect(check("2026-10-24T09:00", "Europe/London")).toBe("2026-10-24T08:00:00.000Z"); // BST
    expect(check("2026-10-26T09:00", "Europe/London")).toBe("2026-10-26T09:00:00.000Z"); // GMT
  });
});

describe("editing a meeting", () => {
  const edit = makeEditMeetingSchema({ now: () => NOW });
  const id = "22222222-2222-4222-8222-222222222222";
  it("allows up to a day back for corrections", () => {
    expect(edit.safeParse({ id, ...meeting, startsAt: "2026-09-29T00:00" }).success).toBe(true); // yesterday evening UTC
    const r = edit.safeParse({ id, ...meeting, startsAt: "2026-09-27T09:00" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Pick a time from yesterday on.");
  });
});

describe("helpers", () => {
  it("finds a Join link only for web addresses", () => {
    expect(meetingLink("https://meet.google.com/abc-defg-hij")).toBe("https://meet.google.com/abc-defg-hij");
    expect(meetingLink("Office, 2nd floor")).toBeNull();
    expect(meetingLink(null)).toBeNull();
  });
  it("labels reminders", () => {
    expect([10, 30, 60, 1440, 120, 2880, 45].map(reminderLabel)).toEqual([
      "10 min",
      "30 min",
      "1 hour",
      "1 day",
      "2 hours",
      "2 days",
      "45 min",
    ]);
  });
});
