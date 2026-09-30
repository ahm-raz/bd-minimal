import { describe, expect, it } from "vitest";
import { leadStage, SUGGESTED_CATEGORIES, splitTypesByStage } from "@/lib/activity-suggestions";
import { ACTIVITY_CATEGORIES, LEAD_STATUSES } from "@/lib/domain";

const TYPES = [
  { id: "1", name: "LinkedIn connection request", category: "outreach" as const },
  { id: "2", name: "Cold email", category: "outreach" as const },
  { id: "3", name: "Email follow-up", category: "follow_up" as const },
  { id: "4", name: "Reply received", category: "inbound_reply" as const },
  { id: "5", name: "Phone call", category: "call" as const },
  { id: "6", name: "Meeting held", category: "meeting" as const },
  { id: "7", name: "Proposal sent", category: "proposal" as const },
  { id: "8", name: "Other", category: "other" as const },
];
const names = (l: { name: string }[]) => l.map((t) => t.name);

describe("suggested activity types (APP-GUIDE §6)", () => {
  it("a new lead suggests first outreach; follow-ups, replies, meetings and proposals wait under More", () => {
    const { suggested, more } = splitTypesByStage(TYPES, "new");
    expect(names(suggested)).toEqual(["LinkedIn connection request", "Cold email", "Phone call", "Other"]);
    expect(names(more)).toEqual(["Email follow-up", "Reply received", "Meeting held", "Proposal sent"]);
  });

  it("after a meeting is booked, first-touch outreach moves under More and meeting steps come first", () => {
    const { suggested, more } = splitTypesByStage(TYPES, leadStage("replied", true));
    expect(names(suggested)[0]).toBe("Meeting held");
    expect(names(more)).toEqual(expect.arrayContaining(["LinkedIn connection request", "Cold email"]));
  });

  it("nothing is lost: suggested and More together are every type, once each", () => {
    for (const stage of Object.keys(SUGGESTED_CATEGORIES) as (keyof typeof SUGGESTED_CATEGORIES)[]) {
      const { suggested, more } = splitTypesByStage(TYPES, stage);
      expect([...suggested, ...more].map((t) => t.id).sort()).toEqual(TYPES.map((t) => t.id).sort());
      expect(names(suggested)).toContain("Other");
    }
  });

  it("every lead status has suggestions, using only real categories", () => {
    for (const s of LEAD_STATUSES) {
      expect(SUGGESTED_CATEGORIES[s].length).toBeGreaterThan(0);
      for (const c of SUGGESTED_CATEGORIES[s]) expect(ACTIVITY_CATEGORIES).toContain(c);
    }
  });

  it("a booked meeting doesn't override closed statuses", () => {
    expect(leadStage("customer", true)).toBe("customer");
    expect(leadStage("contacted", true)).toBe("meeting_booked");
    expect(leadStage("contacted", false)).toBe("contacted");
  });
});
