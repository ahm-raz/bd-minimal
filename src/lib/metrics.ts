import { weekdaysBetween, isoWeekday, workdayElapsedShare, type LocalDate } from "@/lib/dates";

/**
 * Target and pace formulas (docs/05, sections 2 and 3).
 * KPI counts themselves always come from the SQL metric functions; this file only
 * turns those counts and the stored weekly targets into rates, targets and pace.
 */

/** numerator ÷ denominator, or null when the denominator is 0 (rendered as "–"). */
export function rate(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

export const replyRate = (m: { replies: number; outreach: number }) => rate(m.replies, m.outreach);
export const positiveReplyRate = (m: { positive_replies: number; outreach: number }) =>
  rate(m.positive_replies, m.outreach);
export const meetingRate = (m: { meetings_booked: number; outreach: number }) => rate(m.meetings_booked, m.outreach);
export const proposalRate = (m: { proposals_sent: number; meetings_done: number }) =>
  rate(m.proposals_sent, m.meetings_done);
export const winRate = (won: number, lost: number) => rate(won, won + lost);

/** Daily target = weekly ÷ 5, rounded to the nearest whole number. */
export function dailyTarget(weekly: number): number {
  return Math.round(weekly / 5);
}

/** Target for a range = weekly ÷ 5 × weekdays (Mon–Fri) in the range, rounded. */
export function rangeTarget(weekly: number, fromDate: LocalDate, toDate: LocalDate): number {
  return Math.round((weekly / 5) * weekdaysBetween(fromDate, toDate));
}

/** Achievement = actual ÷ range target; null when there is no target. */
export function achievement(actual: number, target: number): number | null {
  return rate(actual, target);
}

/** Where a person should be by now for today: target × share of the 09:00–18:00 day elapsed. */
export function dayPaceMarker(target: number, tz: string, now: Date = new Date()): number {
  return target * workdayElapsedShare(tz, now);
}

/** Where a person should be by now this week: weekly target × weekdays elapsed including today ÷ 5. */
export function weekPaceMarker(weeklyTarget: number, today: LocalDate): number {
  const elapsed = Math.min(5, isoWeekday(today));
  return (weeklyTarget * elapsed) / 5;
}

export type PaceState = "ahead" | "behind" | "far_behind";

/** Green at or ahead of pace, amber when behind by less than 20%, red when further behind. */
export function paceState(actual: number, expected: number): PaceState {
  if (expected <= 0 || actual >= expected) return "ahead";
  const behind = (expected - actual) / expected;
  return behind < 0.2 ? "behind" : "far_behind";
}

/** Consistency grid shade (docs/05, section 6). */
export type GridShade = "empty" | "light" | "medium" | "full";
export function gridShade(value: number, daily: number): GridShade {
  if (value <= 0) return "empty";
  if (daily <= 0) return "full";
  const share = value / daily;
  if (share >= 1) return "full";
  if (share >= 0.5) return "medium";
  return "light";
}
