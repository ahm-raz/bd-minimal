import { describe, expect, it } from "vitest";
import {
  addDays,
  dueLabel,
  dueState,
  eachDay,
  formatRelative,
  isLocalDate,
  isoWeekday,
  localClock,
  previousRange,
  rangeFor,
  startOfLocalDay,
  startOfWeek,
  todayIn,
  weekdaysBetween,
  workdayElapsedShare,
} from "@/lib/dates";

describe("todayIn", () => {
  it("uses the time zone, not UTC", () => {
    // 2026-09-24 20:30 UTC is already the 25th in Karachi (UTC+5)
    const now = new Date("2026-09-24T20:30:00Z");
    expect(todayIn("Asia/Karachi", now)).toBe("2026-09-25");
    expect(todayIn("Europe/Berlin", now)).toBe("2026-09-24");
    expect(todayIn("America/Chicago", now)).toBe("2026-09-24");
  });

  it("Asia/Karachi midnight edge: 18:59:59Z is still today, 19:00Z is tomorrow", () => {
    expect(todayIn("Asia/Karachi", new Date("2026-09-24T18:59:59Z"))).toBe("2026-09-24");
    expect(todayIn("Asia/Karachi", new Date("2026-09-24T19:00:00Z"))).toBe("2026-09-25");
  });
});

describe("rangeFor", () => {
  it("today in Karachi maps to [19:00Z previous day, 19:00Z)", () => {
    const r = rangeFor("today", "Asia/Karachi", new Date("2026-09-24T05:00:00Z"));
    expect(r).toEqual({
      fromUtc: "2026-09-23T19:00:00.000Z",
      toUtc: "2026-09-24T19:00:00.000Z",
      fromDate: "2026-09-24",
      toDate: "2026-09-24",
    });
  });

  it("today right after Karachi midnight is the new day", () => {
    const r = rangeFor("today", "Asia/Karachi", new Date("2026-09-24T19:00:30Z"));
    expect(r.fromDate).toBe("2026-09-25");
    expect(r.fromUtc).toBe("2026-09-24T19:00:00.000Z");
  });

  it("Europe/Berlin DST: the last Sunday of March is 23 hours long", () => {
    // 2026-03-29: clocks go from 02:00 CET to 03:00 CEST
    const now = new Date("2026-03-29T12:00:00Z");
    const r = rangeFor("today", "Europe/Berlin", now);
    expect(r.fromDate).toBe("2026-03-29");
    expect(r.fromUtc).toBe("2026-03-28T23:00:00.000Z"); // 00:00 CET = UTC+1
    expect(r.toUtc).toBe("2026-03-29T22:00:00.000Z"); // next 00:00 CEST = UTC+2
    expect(new Date(r.toUtc).getTime() - new Date(r.fromUtc).getTime()).toBe(23 * 3600 * 1000);
  });

  it("Europe/Berlin DST: a week spanning the change starts at +1 and ends at +2", () => {
    const r = rangeFor("this_week", "Europe/Berlin", new Date("2026-03-26T10:00:00Z"));
    expect(r.fromDate).toBe("2026-03-23");
    expect(r.toDate).toBe("2026-03-29");
    expect(r.fromUtc).toBe("2026-03-22T23:00:00.000Z");
    expect(r.toUtc).toBe("2026-03-29T22:00:00.000Z");
  });

  it("Europe/Berlin autumn change makes a 25 hour day", () => {
    const r = rangeFor("today", "Europe/Berlin", new Date("2026-10-25T12:00:00Z"));
    expect(new Date(r.toUtc).getTime() - new Date(r.fromUtc).getTime()).toBe(25 * 3600 * 1000);
  });

  it("weeks run Monday to Sunday", () => {
    // Thursday 24 Sep 2026
    const now = new Date("2026-09-24T08:00:00Z");
    const r = rangeFor("this_week", "Asia/Karachi", now);
    expect(r.fromDate).toBe("2026-09-21");
    expect(r.toDate).toBe("2026-09-27");
    const last = rangeFor("last_week", "Asia/Karachi", now);
    expect(last.fromDate).toBe("2026-09-14");
    expect(last.toDate).toBe("2026-09-20");
  });

  it("on Sunday, this week is still the week that started Monday", () => {
    const r = rangeFor("this_week", "Asia/Karachi", new Date("2026-09-27T08:00:00Z"));
    expect(r.fromDate).toBe("2026-09-21");
  });

  it("yesterday, months and rolling windows", () => {
    const now = new Date("2026-03-10T08:00:00Z");
    expect(rangeFor("yesterday", "UTC", now).fromDate).toBe("2026-03-09");
    expect(rangeFor("this_month", "UTC", now)).toMatchObject({ fromDate: "2026-03-01", toDate: "2026-03-31" });
    expect(rangeFor("last_month", "UTC", now)).toMatchObject({ fromDate: "2026-02-01", toDate: "2026-02-28" });
    expect(rangeFor("last_7_days", "UTC", now)).toMatchObject({ fromDate: "2026-03-04", toDate: "2026-03-10" });
    expect(rangeFor("last_30_days", "UTC", now)).toMatchObject({ fromDate: "2026-02-09", toDate: "2026-03-10" });
  });

  it("last month across a year boundary", () => {
    expect(rangeFor("last_month", "UTC", new Date("2026-01-15T00:00:00Z"))).toMatchObject({
      fromDate: "2025-12-01",
      toDate: "2025-12-31",
    });
  });

  it("custom is inclusive and orders its bounds", () => {
    const r = rangeFor("custom", "UTC", new Date(), { from: "2026-09-10", to: "2026-09-01" });
    expect(r).toEqual({
      fromUtc: "2026-09-01T00:00:00.000Z",
      toUtc: "2026-09-11T00:00:00.000Z",
      fromDate: "2026-09-01",
      toDate: "2026-09-10",
    });
  });

  it("previousRange has the same length", () => {
    const r = rangeFor("this_week", "UTC", new Date("2026-09-24T08:00:00Z"));
    expect(previousRange(r, "UTC")).toMatchObject({ fromDate: "2026-09-14", toDate: "2026-09-20" });
  });
});

describe("weekdaysBetween", () => {
  it("counts Mon–Fri inclusive", () => {
    expect(weekdaysBetween("2026-09-21", "2026-09-27")).toBe(5); // Mon–Sun
    expect(weekdaysBetween("2026-09-26", "2026-09-27")).toBe(0); // Sat–Sun
    expect(weekdaysBetween("2026-09-24", "2026-09-24")).toBe(1); // Thu
    expect(weekdaysBetween("2026-09-01", "2026-09-30")).toBe(22);
    expect(weekdaysBetween("2026-09-25", "2026-09-28")).toBe(2); // Fri–Mon
    expect(weekdaysBetween("2026-09-28", "2026-09-21")).toBe(0);
  });

  it("matches a day-by-day count for many ranges", () => {
    for (let start = 0; start < 14; start++) {
      for (let len = 0; len < 40; len++) {
        const from = addDays("2026-09-01", start);
        const to = addDays(from, len);
        const brute = eachDay(from, to).filter((d) => isoWeekday(d) <= 5).length;
        expect(weekdaysBetween(from, to)).toBe(brute);
      }
    }
  });
});

describe("calendar helpers", () => {
  it("validates local dates", () => {
    expect(isLocalDate("2026-02-28")).toBe(true);
    expect(isLocalDate("2026-02-30")).toBe(false);
    expect(isLocalDate("26-2-3")).toBe(false);
  });

  it("startOfWeek and addDays across months", () => {
    expect(startOfWeek("2026-10-01")).toBe("2026-09-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isoWeekday("2026-09-27")).toBe(7);
  });

  it("startOfLocalDay uses the zone's offset", () => {
    expect(startOfLocalDay("2026-09-24", "America/Chicago").toISOString()).toBe("2026-09-24T05:00:00.000Z");
  });

  it("dueLabel and dueState", () => {
    const today = "2026-09-24"; // Thu
    expect(dueLabel("2026-09-24", today)).toBe("Today");
    expect(dueLabel("2026-09-23", today)).toBe("Yesterday");
    expect(dueLabel("2026-09-25", today)).toBe("Tomorrow");
    expect(dueLabel("2026-09-30", today)).toBe("Wed");
    expect(dueLabel("2026-10-12", today)).toBe("12 Oct");
    expect(dueLabel("2026-09-10", today)).toBe("10 Sep");
    expect(dueState("2026-09-23", today)).toBe("overdue");
    expect(dueState("2026-09-24", today)).toBe("today");
    expect(dueState("2026-09-25", today)).toBe("upcoming");
    expect(dueState(null, today)).toBe("none");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-09-24T12:00:00Z"); // 17:00 in Karachi
  const tz = "Asia/Karachi";
  it("recent items are relative", () => {
    expect(formatRelative(new Date("2026-09-24T11:59:30Z"), tz, now)).toBe("Just now");
    expect(formatRelative(new Date("2026-09-24T11:58:00Z"), tz, now)).toBe("2 min ago");
    expect(formatRelative(new Date("2026-09-24T09:10:00Z"), tz, now)).toBe("Today 14:10");
    expect(formatRelative(new Date("2026-09-23T11:40:00Z"), tz, now)).toBe("Yesterday 16:40");
  });
  it("older items are absolute", () => {
    expect(formatRelative(new Date("2026-09-12T11:40:00Z"), tz, now)).toBe("12 Sep, 16:40");
    expect(formatRelative(new Date("2025-09-12T11:40:00Z"), tz, now)).toBe("12 Sep 2025, 16:40");
  });
  it("yesterday is judged in the viewer's zone", () => {
    // 19:30Z on the 23rd is 00:30 on the 24th in Karachi: today, not yesterday
    expect(formatRelative(new Date("2026-09-23T19:30:00Z"), tz, now)).toBe("Today 00:30");
  });
});

describe("local clock and workday share", () => {
  it("shows the prospect's local time", () => {
    expect(localClock("America/Chicago", new Date("2026-09-24T14:14:00Z"))).toBe("9:14 AM");
  });
  it("clamps the 09:00–18:00 share", () => {
    const tz = "UTC";
    expect(workdayElapsedShare(tz, new Date("2026-09-24T08:00:00Z"))).toBe(0);
    expect(workdayElapsedShare(tz, new Date("2026-09-24T13:30:00Z"))).toBe(0.5);
    expect(workdayElapsedShare(tz, new Date("2026-09-24T20:00:00Z"))).toBe(1);
  });
});
