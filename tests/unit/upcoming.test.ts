import { describe, expect, it } from "vitest";
import { localDateOf } from "@/lib/dates";
import { bucketOf, groupsFor, groupUpcoming, urgentCount, type UpcomingItem } from "@/lib/notifications";

const TZ = "Asia/Karachi";
const NOW = new Date("2026-09-29T07:00:00Z"); // 12:00 in Karachi
const TODAY = "2026-09-29";
const local = (iso: string) => localDateOf(new Date(iso), TZ);

const item = (over: Partial<UpcomingItem>): UpcomingItem => ({
  key: Math.random().toString(),
  kind: "task",
  title: "x",
  detail: null,
  link: "/",
  at: null,
  date: null,
  ...over,
});

describe("What's upcoming buckets (docs/10 section 3)", () => {
  it("timed items: overdue, within the hour, today, later", () => {
    expect(bucketOf(item({ kind: "meeting", at: "2026-09-29T06:30:00Z" }), NOW, TODAY, local)).toBe("overdue");
    expect(bucketOf(item({ kind: "meeting", at: "2026-09-29T07:45:00Z" }), NOW, TODAY, local)).toBe("hour");
    expect(bucketOf(item({ kind: "meeting", at: "2026-09-29T15:00:00Z" }), NOW, TODAY, local)).toBe("today"); // 20:00 Karachi
    expect(bucketOf(item({ kind: "meeting", at: "2026-09-29T20:00:00Z" }), NOW, TODAY, local)).toBe("week"); // 01:00 tomorrow in Karachi
  });
  it("dated items use the viewer's local date", () => {
    expect(bucketOf(item({ date: "2026-09-28" }), NOW, TODAY, local)).toBe("overdue");
    expect(bucketOf(item({ date: TODAY }), NOW, TODAY, local)).toBe("today");
    expect(bucketOf(item({ date: "2026-10-02" }), NOW, TODAY, local)).toBe("week");
  });
  it("review and changes requested are always today's work", () => {
    expect(bucketOf(item({ kind: "review", date: "2026-10-05" }), NOW, TODAY, local)).toBe("today");
  });

  it("groups in order and sorts by time inside a group", () => {
    const groups = groupUpcoming(
      [
        item({ title: "later", date: "2026-10-03" }),
        item({ title: "meeting 3pm", kind: "meeting", at: "2026-09-29T10:00:00Z" }),
        item({ title: "old", date: "2026-09-20" }),
        item({ title: "task today", date: TODAY }),
        item({ title: "meeting 1pm", kind: "meeting", at: "2026-09-29T07:30:00Z" }),
      ],
      NOW,
      TODAY,
      local,
    );
    expect(groups.map((g) => [g.bucket, g.items.map((i) => i.title)])).toEqual([
      ["overdue", ["old"]],
      ["hour", ["meeting 1pm"]],
      ["today", ["meeting 3pm", "task today"]],
      ["week", ["later"]],
    ]);
  });

  it("badge counts overdue, today and anything timed within 24 hours", () => {
    const n = urgentCount(
      [
        item({ date: "2026-09-20" }),
        item({ date: TODAY }),
        item({ kind: "meeting", at: "2026-09-30T05:00:00Z" }), // tomorrow, within 24h
        item({ kind: "meeting", at: "2026-10-02T05:00:00Z" }),
        item({ date: "2026-10-01" }),
      ],
      NOW,
      TODAY,
      local,
    );
    expect(n).toBe(3);
  });
});

describe("notification groups per role", () => {
  it("SMMs never get sales groups", () => {
    expect(groupsFor("social")).toEqual(["tasks", "social"]);
    expect(groupsFor("bd")).not.toContain("social");
    expect(groupsFor("founder")).toHaveLength(5);
  });
});
