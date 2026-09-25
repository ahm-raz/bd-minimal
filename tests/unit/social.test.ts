import { describe, expect, it } from "vitest";
import { formatCountdown, formatDualZone, shiftLocalDays, zoneCity } from "@/lib/dates";
import { allowedPostActions, canEditWork, charCounterTone, CHAR_LIMITS, isLate, nextSlots, POST_STATUSES, type PostStatus } from "@/lib/social";
import { markPostedSchema, postedAtError, postWorkSchema, scheduleSchema } from "@/lib/validation/social";
import { inviteSchema } from "@/lib/validation/auth";
import type { Role } from "@/lib/domain";

const ID = "00000000-0000-4000-8000-000000000001";

describe("zoneCity", () => {
  it("uses the last part of the zone name", () => {
    expect(zoneCity("America/New_York")).toBe("New York");
    expect(zoneCity("Asia/Karachi")).toBe("Karachi");
    expect(zoneCity("UTC")).toBe("UTC");
  });
});

describe("formatDualZone", () => {
  it("shows the audience time with the viewer's time next to it (EDT)", () => {
    // 30 Sep 2026 13:00 UTC = 9:00 AM New York (EDT) = 6:00 PM Karachi
    expect(formatDualZone("2026-09-30T13:00:00Z", "America/New_York", "Asia/Karachi")).toBe(
      "Wed 30 Sep, 9:00 AM New York (6:00 PM your time)",
    );
  });

  it("follows DST: after 1 Nov New York is UTC-5", () => {
    expect(formatDualZone("2026-11-02T14:00:00Z", "America/New_York", "Asia/Karachi")).toBe(
      "Mon 2 Nov, 9:00 AM New York (7:00 PM your time)",
    );
  });

  it("adds the viewer's day when it differs", () => {
    // 9:00 PM New York on Tue = 6:00 AM Wed in Karachi
    expect(formatDualZone("2026-09-30T01:00:00Z", "America/New_York", "Asia/Karachi")).toBe(
      "Tue 29 Sep, 9:00 PM New York (Wed 30 Sep, 6:00 AM your time)",
    );
  });

  it("leaves out the viewer part when the times match", () => {
    expect(formatDualZone("2026-09-30T13:00:00Z", "America/New_York", "America/New_York")).toBe("Wed 30 Sep, 9:00 AM New York");
  });
});

describe("formatCountdown", () => {
  const now = new Date("2026-09-25T10:00:00Z");
  it("formats time left", () => {
    expect(formatCountdown("2026-09-25T12:10:00Z", now)).toBe("in 2h 10m");
    expect(formatCountdown("2026-09-25T10:45:00Z", now)).toBe("in 45m");
    expect(formatCountdown("2026-09-25T12:00:00Z", now)).toBe("in 2h");
    expect(formatCountdown("2026-09-28T14:00:00Z", now)).toBe("in 3d 4h");
  });
  it("formats time past and now", () => {
    expect(formatCountdown("2026-09-25T09:30:00Z", now)).toBe("30m ago");
    expect(formatCountdown("2026-09-25T10:00:20Z", now)).toBe("now");
  });
});

describe("shiftLocalDays", () => {
  it("keeps the wall-clock time across DST", () => {
    // Fri 30 Oct 9:00 AM EDT -> Mon 2 Nov 9:00 AM EST
    expect(shiftLocalDays("2026-10-30T13:00:00Z", "America/New_York", 3).toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });
});

describe("charCounterTone", () => {
  it("is ok below 90%, warn from 90% up to the limit, bad above it", () => {
    expect(charCounterTone(251, 280)).toBe("ok");
    expect(charCounterTone(252, 280)).toBe("warn");
    expect(charCounterTone(280, 280)).toBe("warn");
    expect(charCounterTone(281, 280)).toBe("bad");
    expect(charCounterTone(99999, undefined)).toBe("ok");
  });
  it("knows the platform limits", () => {
    expect(CHAR_LIMITS.x).toBe(280);
    expect(CHAR_LIMITS.linkedin_page).toBe(3000);
    expect(CHAR_LIMITS.instagram).toBe(2200);
    expect(CHAR_LIMITS.other).toBeUndefined();
  });
});

describe("allowedPostActions", () => {
  const act = (role: Role, isAssignee: boolean, status: PostStatus, needsApproval = true) =>
    allowedPostActions({ role, isAssignee, status, needsApproval });

  it("moves the assignee along the flow", () => {
    expect(act("social", true, "idea")).toEqual([]);
    expect(act("social", true, "planned")).toEqual(["start_drafting"]);
    expect(act("social", true, "drafting")).toEqual(["submit"]);
    expect(act("social", true, "drafting", false)).toEqual(["mark_posted", "submit"]);
    expect(act("social", true, "changes_requested")).toEqual(["submit"]);
    expect(act("social", true, "approved")).toEqual(["mark_posted"]);
    expect(act("social", true, "missed")).toEqual(["mark_posted"]);
    expect(act("social", true, "posted")).toEqual(["add_results"]);
    expect(act("social", true, "cancelled")).toEqual([]);
  });

  it("never lets the assignee review or cancel", () => {
    for (const s of POST_STATUSES) {
      const a = act("social", true, s);
      expect(a).not.toContain("approve");
      expect(a).not.toContain("request_changes");
      expect(a).not.toContain("cancel");
      expect(a).not.toContain("schedule");
    }
  });

  it("gives the founder review, scheduling and cancel", () => {
    expect(act("founder", false, "idea")).toEqual(["schedule", "cancel"]);
    expect(act("founder", false, "in_review")).toEqual(["approve", "request_changes", "cancel"]);
    expect(act("founder", false, "posted")).toEqual(["add_results"]);
    expect(act("founder", false, "cancelled")).toEqual([]);
  });

  it("gives nothing to someone who isn't the assignee or the founder", () => {
    for (const s of POST_STATUSES) expect(act("social", false, s)).toEqual([]);
    for (const s of POST_STATUSES) expect(act("bd", false, s)).toEqual([]);
  });

  it("lets the work be edited until the post is out or cancelled", () => {
    expect(canEditWork({ role: "social", isAssignee: true, status: "drafting" })).toBe(true);
    expect(canEditWork({ role: "social", isAssignee: true, status: "posted" })).toBe(false);
    expect(canEditWork({ role: "social", isAssignee: false, status: "drafting" })).toBe(false);
  });
});

describe("isLate", () => {
  it("is on time up to 60 minutes after the post time", () => {
    expect(isLate("2026-09-25T13:00:00Z", "2026-09-25T14:00:00Z")).toBe(false);
    expect(isLate("2026-09-25T13:00:00Z", "2026-09-25T14:00:01Z")).toBe(true);
  });
});

describe("nextSlots", () => {
  const s = { weekdays: [1, 3, 5], localTime: "09:00", timezone: "America/New_York", startsOn: "2026-09-01", endsOn: null };
  it("lists the next matching days at the local time", () => {
    // Fri 25 Sep 2026, 14:00 UTC = 10:00 AM New York: today's 9:00 has passed
    const out = nextSlots(s, new Date("2026-09-25T14:00:00Z")).map((d) => d.toISOString());
    expect(out).toEqual(["2026-09-28T13:00:00.000Z", "2026-09-30T13:00:00.000Z", "2026-10-02T13:00:00.000Z"]);
  });
  it("is DST-correct and respects the end date", () => {
    const out = nextSlots({ ...s, endsOn: "2026-11-04" }, new Date("2026-10-29T00:00:00Z"), 5).map((d) => d.toISOString());
    expect(out).toEqual(["2026-10-30T13:00:00.000Z", "2026-11-02T14:00:00.000Z", "2026-11-04T14:00:00.000Z"]);
  });
  it("returns nothing without days", () => {
    expect(nextSlots({ ...s, weekdays: [] })).toEqual([]);
  });
});

describe("social schemas", () => {
  it("needs the live post link to mark as posted", () => {
    expect(markPostedSchema.safeParse({ id: ID, postUrl: "" }).success).toBe(false);
    expect(markPostedSchema.safeParse({ id: ID, postUrl: "linkedin.com/x" }).success).toBe(false);
    expect(markPostedSchema.safeParse({ id: ID, postUrl: "https://www.linkedin.com/feed/update/1" }).success).toBe(true);
  });
  it("allows a posted time up to 24 hours back, not in the future", () => {
    const now = new Date("2026-09-25T12:00:00Z");
    expect(postedAtError(new Date("2026-09-24T13:00:00Z"), now)).toBeNull();
    expect(postedAtError(new Date("2026-09-24T11:00:00Z"), now)).toBe("Use a time within the last 24 hours.");
    expect(postedAtError(new Date("2026-09-25T13:00:00Z"), now)).toBe("The posted time can't be in the future.");
  });
  it("checks media links and drops empty ones", () => {
    const ok = postWorkSchema.safeParse({ id: ID, caption: "Hi", mediaLinks: ["https://drive.google.com/x", ""] });
    expect(ok.success && ok.data.mediaLinks).toEqual(["https://drive.google.com/x"]);
    expect(postWorkSchema.safeParse({ id: ID, mediaLinks: ["not a link"] }).success).toBe(false);
  });
  it("needs a day and an end after the start for schedules", () => {
    const base = {
      accountId: ID,
      assigneeId: ID,
      weekdays: [1],
      localTime: "09:00",
      timezone: "America/New_York",
      defaultFormat: "text",
      needsApproval: true,
      draftLeadHours: "24",
      startsOn: "2026-10-01",
    };
    expect(scheduleSchema.safeParse(base).success).toBe(true);
    expect(scheduleSchema.safeParse({ ...base, weekdays: [] }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...base, endsOn: "2026-09-01" }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...base, draftLeadHours: "400" }).success).toBe(false);
  });
  it("needs a niche for BDs only when inviting", () => {
    const base = { fullName: "Hina Raza", email: "hina@example.com", timezone: "Asia/Karachi" };
    expect(inviteSchema.safeParse({ ...base, role: "social" }).success).toBe(true);
    expect(inviteSchema.safeParse({ ...base, role: "bd" }).success).toBe(false);
    expect(inviteSchema.safeParse({ ...base, role: "bd", primaryNicheId: ID }).success).toBe(true);
    expect(inviteSchema.safeParse({ ...base, role: "founder" }).success).toBe(false);
  });
});
