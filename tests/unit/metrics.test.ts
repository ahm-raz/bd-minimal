import { describe, expect, it } from "vitest";
import {
  achievement,
  dailyTarget,
  dayPaceMarker,
  gridShade,
  meetingRate,
  paceState,
  positiveReplyRate,
  proposalRate,
  rangeTarget,
  rate,
  replyRate,
  weekPaceMarker,
  winRate,
} from "@/lib/metrics";
import { formatRatio } from "@/lib/format";

describe("rates (docs/05 section 2)", () => {
  it("reply rate = replies ÷ outreach", () => {
    expect(replyRate({ replies: 9, outreach: 100 })).toBe(0.09);
    expect(formatRatio(replyRate({ replies: 9, outreach: 118 }))).toBe("7.6%");
  });
  it("positive reply rate = positive replies ÷ outreach", () => {
    expect(positiveReplyRate({ positive_replies: 3, outreach: 60 })).toBe(0.05);
  });
  it("meeting rate = meetings booked ÷ outreach", () => {
    expect(meetingRate({ meetings_booked: 3, outreach: 75 })).toBe(0.04);
  });
  it("proposal rate = proposals sent ÷ meetings done", () => {
    expect(proposalRate({ proposals_sent: 2, meetings_done: 4 })).toBe(0.5);
  });
  it("win rate = won ÷ (won + lost)", () => {
    expect(winRate(2, 2)).toBe(0.5);
    expect(winRate(1, 0)).toBe(1);
  });
  it("a zero denominator gives null, shown as –", () => {
    expect(rate(5, 0)).toBeNull();
    expect(replyRate({ replies: 0, outreach: 0 })).toBeNull();
    expect(proposalRate({ proposals_sent: 1, meetings_done: 0 })).toBeNull();
    expect(winRate(0, 0)).toBeNull();
    expect(formatRatio(winRate(0, 0))).toBe("–");
  });
});

describe("targets (docs/05 section 3)", () => {
  it("daily target = weekly ÷ 5, rounded", () => {
    expect(dailyTarget(112)).toBe(22);
    expect(dailyTarget(75)).toBe(15);
    expect(dailyTarget(3)).toBe(1);
    expect(dailyTarget(2)).toBe(0);
    expect(dailyTarget(0)).toBe(0);
  });
  it("range target = weekly ÷ 5 × weekdays in the range, rounded", () => {
    expect(rangeTarget(112, "2026-09-21", "2026-09-27")).toBe(112); // a full week
    expect(rangeTarget(112, "2026-09-24", "2026-09-24")).toBe(22); // one weekday
    expect(rangeTarget(112, "2026-09-26", "2026-09-27")).toBe(0); // a weekend
    expect(rangeTarget(100, "2026-09-01", "2026-09-30")).toBe(440); // 22 weekdays
    expect(rangeTarget(3, "2026-09-21", "2026-09-23")).toBe(2); // 1.8 → 2
  });
  it("this week on Wednesday still uses the full week", () => {
    expect(rangeTarget(112, "2026-09-21", "2026-09-27")).toBe(112);
  });
  it("achievement = actual ÷ range target", () => {
    expect(achievement(118, 112)).toBeCloseTo(1.0536, 3);
    expect(formatRatio(achievement(84, 112))).toBe("75%");
    expect(achievement(5, 0)).toBeNull();
  });
});

describe("pace", () => {
  it("week marker = weekly × weekdays elapsed including today ÷ 5", () => {
    expect(weekPaceMarker(112, "2026-09-23")).toBeCloseTo(67.2); // Wednesday
    expect(weekPaceMarker(112, "2026-09-21")).toBeCloseTo(22.4); // Monday
    expect(weekPaceMarker(112, "2026-09-27")).toBe(112); // Sunday: all 5 weekdays done
  });
  it("day marker = target × share of 09:00–18:00 elapsed", () => {
    expect(dayPaceMarker(22, "UTC", new Date("2026-09-24T08:00:00Z"))).toBe(0);
    expect(dayPaceMarker(22, "UTC", new Date("2026-09-24T13:30:00Z"))).toBe(11);
    expect(dayPaceMarker(22, "UTC", new Date("2026-09-24T19:00:00Z"))).toBe(22);
    // 13:30 in Karachi is 08:30Z
    expect(dayPaceMarker(18, "Asia/Karachi", new Date("2026-09-24T08:30:00Z"))).toBe(9);
  });
  it("colour: ahead green, behind <20% amber, further red (the docs example is amber)", () => {
    expect(paceState(58, 67.2)).toBe("behind"); // 13.7% behind
    expect(paceState(70, 67)).toBe("ahead");
    expect(paceState(67, 67)).toBe("ahead");
    expect(paceState(54, 67.2)).toBe("behind"); // (67.2 - 54) / 67.2 = 19.6% behind
    expect(paceState(53, 67.2)).toBe("far_behind"); // 21.1% behind
  });
  it("the 20% boundary", () => {
    expect(paceState(80, 100)).toBe("far_behind");
    expect(paceState(81, 100)).toBe("behind");
    expect(paceState(0, 0)).toBe("ahead");
  });
});

describe("consistency grid shade (docs/05 section 6)", () => {
  it("empty, light, medium, full", () => {
    expect(gridShade(0, 22)).toBe("empty");
    expect(gridShade(10, 22)).toBe("light");
    expect(gridShade(11, 22)).toBe("medium");
    expect(gridShade(22, 22)).toBe("full");
    expect(gridShade(30, 22)).toBe("full");
    expect(gridShade(3, 0)).toBe("full");
  });
});
