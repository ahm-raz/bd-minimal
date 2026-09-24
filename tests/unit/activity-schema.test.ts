import { describe, expect, it } from "vitest";
import { defaultOutcome, makeLogActivitySchema, outcomesFor, type OutcomeRef } from "@/lib/validation/activity";

const T = {
  outreach: { id: "t-out", category: "outreach" as const, name: "LinkedIn message" },
  reply: { id: "t-reply", category: "inbound_reply" as const, name: "Reply received" },
  meeting: { id: "t-meet", category: "meeting" as const, name: "Meeting held" },
  proposal: { id: "t-prop", category: "proposal" as const, name: "Proposal sent" },
};
const OUTCOMES: OutcomeRef[] = [
  { key: "no_response", allowed_categories: ["outreach", "follow_up", "call", "proposal", "other"] },
  { key: "bounced", allowed_categories: ["outreach", "follow_up", "call"] },
  { key: "interested", allowed_categories: ["inbound_reply", "call", "meeting", "proposal", "other"] },
  { key: "not_now", allowed_categories: ["inbound_reply", "call", "meeting", "proposal", "other"] },
  { key: "not_interested", allowed_categories: ["inbound_reply", "call", "meeting", "proposal", "other"] },
  { key: "meeting_booked", allowed_categories: ["inbound_reply", "call", "other"] },
  { key: "done", allowed_categories: ["meeting", "proposal", "other"] },
];
const NOW = new Date("2026-09-24T12:00:00Z"); // 17:00 in Karachi
const schema = makeLogActivitySchema({ types: Object.values(T), outcomes: OUTCOMES, timezone: "Asia/Karachi", now: () => NOW });
const LEAD = "11111111-1111-4111-8111-111111111111";

const base = {
  leadId: LEAD,
  activityTypeId: T.outreach.id,
  outcomeKey: "no_response",
  occurredAt: "2026-09-24T16:30",
  nextAction: "Send DM",
  nextActionDue: "2026-09-26",
};

function errors(input: object) {
  const r = schema.safeParse(input);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("outcomes per type", () => {
  it("offers only outcomes allowed for the category", () => {
    expect(outcomesFor("outreach", OUTCOMES).map((o) => o.key)).toEqual(["no_response", "bounced"]);
    expect(outcomesFor("meeting", OUTCOMES).map((o) => o.key)).toEqual(["interested", "not_now", "not_interested", "done"]);
    expect(outcomesFor("inbound_reply", OUTCOMES).map((o) => o.key)).not.toContain("no_response");
  });
  it("defaults: outreach and follow-up → No response; reply → Interested; meeting and proposal → Done", () => {
    const keys = (c: Parameters<typeof outcomesFor>[0]) => outcomesFor(c, OUTCOMES).map((o) => o.key);
    expect(defaultOutcome("outreach", keys("outreach"))).toBe("no_response");
    expect(defaultOutcome("follow_up", keys("follow_up"))).toBe("no_response");
    expect(defaultOutcome("inbound_reply", keys("inbound_reply"))).toBe("interested");
    expect(defaultOutcome("meeting", keys("meeting"))).toBe("done");
    expect(defaultOutcome("proposal", keys("proposal"))).toBe("done");
  });
  it("rejects an outcome the database would reject", () => {
    expect(errors({ ...base, outcomeKey: "interested" })).toHaveProperty("outcomeKey");
  });
});

describe("next action", () => {
  it("is required by default", () => {
    const e = errors({ ...base, nextAction: "", nextActionDue: null });
    expect(e.nextAction).toBe("Say what the next step is, or tick No next step.");
    expect(e.nextActionDue).toBe("Pick a due date.");
  });
  it("is optional with No next step, and clears it", () => {
    const r = schema.safeParse({ ...base, nextAction: "", nextActionDue: null, noNextStep: true });
    expect(r.success && r.data.clearNextAction).toBe(true);
  });
  it("is optional for Not interested and Bounced", () => {
    expect(schema.safeParse({ ...base, outcomeKey: "bounced", nextAction: "", nextActionDue: null }).success).toBe(true);
    expect(
      schema.safeParse({ ...base, activityTypeId: T.reply.id, outcomeKey: "not_interested", nextAction: "", nextActionDue: null }).success,
    ).toBe(true);
  });
  it("sets it when given", () => {
    const r = schema.safeParse(base);
    expect(r.success && { a: r.data.nextAction, d: r.data.nextActionDue, c: r.data.clearNextAction }).toEqual({
      a: "Send DM",
      d: "2026-09-26",
      c: false,
    });
  });
});

describe("when", () => {
  it("is read in the viewer's time zone", () => {
    const r = schema.safeParse(base);
    expect(r.success && r.data.occurredAtUtc).toBe("2026-09-24T11:30:00.000Z");
  });
  it("can be backdated up to 7 days, not more", () => {
    expect(schema.safeParse({ ...base, occurredAt: "2026-09-17T17:30" }).success).toBe(true);
    expect(errors({ ...base, occurredAt: "2026-09-17T16:00" }).occurredAt).toBe("You can backdate up to 7 days.");
  });
  it("can't be in the future", () => {
    expect(errors({ ...base, occurredAt: "2026-09-24T18:00" }).occurredAt).toBe("It can't be in the future.");
  });
});
