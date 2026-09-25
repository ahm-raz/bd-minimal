import { TZDate } from "@date-fns/tz";
import { format as dfFormat } from "date-fns";

/**
 * Time-zone helpers (docs/04, section 8).
 *
 * Two kinds of values:
 * - Instants: JS Date / ISO strings, stored in UTC.
 * - Local calendar dates: "yyyy-MM-dd" strings in some person's time zone
 *   (next_action_due, tasks.due_date, date range bounds).
 *
 * Weeks run Monday to Sunday.
 */

export type LocalDate = string; // "yyyy-MM-dd"

export const RANGE_PRESETS = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "last_7_days",
  "last_30_days",
  "custom",
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  last_week: "Last week",
  this_month: "This month",
  last_month: "Last month",
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  custom: "Custom",
};

export type DateRange = {
  /** inclusive start instant (start 00:00 local), ISO string in UTC */
  fromUtc: string;
  /** exclusive end instant (end + 1 day 00:00 local), ISO string in UTC */
  toUtc: string;
  /** first local date, inclusive */
  fromDate: LocalDate;
  /** last local date, inclusive */
  toDate: LocalDate;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLocalDate(value: string): value is LocalDate {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function parts(date: LocalDate): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid local date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Local date as a UTC-midnight Date, for calendar arithmetic only. */
function asUtcDay(date: LocalDate): Date {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDay(d: Date): LocalDate {
  return d.toISOString().slice(0, 10);
}

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** All IANA time zones the runtime knows, for pickers. */
export function timeZoneList(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  const list = intl.supportedValuesOf?.("timeZone") ?? [];
  return list.includes("UTC") ? list : ["UTC", ...list];
}

/** The local calendar date in `tz` at instant `now`. */
export function todayIn(tz: string, now: Date = new Date()): LocalDate {
  return dfFormat(new TZDate(now.getTime(), tz), "yyyy-MM-dd");
}

/** The local calendar date of an instant in `tz`. */
export function localDateOf(instant: Date | string, tz: string): LocalDate {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return todayIn(tz, d);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = asUtcDay(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtcDay(d);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((asUtcDay(b).getTime() - asUtcDay(a).getTime()) / 86_400_000);
}

/** ISO day of week: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: LocalDate): number {
  const day = asUtcDay(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function isWeekend(date: LocalDate): boolean {
  return isoWeekday(date) > 5;
}

export function startOfWeek(date: LocalDate): LocalDate {
  return addDays(date, 1 - isoWeekday(date));
}

export function startOfMonth(date: LocalDate): LocalDate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: LocalDate): LocalDate {
  const [y, m] = parts(date);
  return fromUtcDay(new Date(Date.UTC(y, m, 0)));
}

/** Every local date from `from` to `to`, inclusive. */
export function eachDay(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Number of Mon–Fri days from `from` to `to`, inclusive. 0 if to < from. */
export function weekdaysBetween(from: LocalDate, to: LocalDate): number {
  if (to < from) return 0;
  const total = diffDays(from, to) + 1;
  const fullWeeks = Math.floor(total / 7);
  let count = fullWeeks * 5;
  const startDow = isoWeekday(from);
  for (let i = 0; i < total % 7; i++) {
    const dow = ((startDow - 1 + i) % 7) + 1;
    if (dow <= 5) count++;
  }
  return count;
}

/** The UTC instant of 00:00 on `date` in `tz`. Handles DST. */
export function startOfLocalDay(date: LocalDate, tz: string): Date {
  const [y, m, d] = parts(date);
  return new Date(new TZDate(y, m - 1, d, 0, 0, 0, tz).getTime());
}

/** Convert an inclusive local date range to the `[from, to)` UTC instants the database expects. */
export function localRange(fromDate: LocalDate, toDate: LocalDate, tz: string): DateRange {
  return {
    fromUtc: startOfLocalDay(fromDate, tz).toISOString(),
    toUtc: startOfLocalDay(addDays(toDate, 1), tz).toISOString(),
    fromDate,
    toDate,
  };
}

/** Resolve a preset in the viewer's time zone. `custom` needs `custom.from` and `custom.to` (inclusive). */
export function rangeFor(
  preset: RangePreset,
  tz: string,
  now: Date = new Date(),
  custom?: { from: LocalDate; to: LocalDate },
): DateRange {
  const today = todayIn(tz, now);
  switch (preset) {
    case "today":
      return localRange(today, today, tz);
    case "yesterday": {
      const y = addDays(today, -1);
      return localRange(y, y, tz);
    }
    case "this_week": {
      const start = startOfWeek(today);
      return localRange(start, addDays(start, 6), tz);
    }
    case "last_week": {
      const start = addDays(startOfWeek(today), -7);
      return localRange(start, addDays(start, 6), tz);
    }
    case "this_month":
      return localRange(startOfMonth(today), endOfMonth(today), tz);
    case "last_month": {
      const prev = addDays(startOfMonth(today), -1);
      return localRange(startOfMonth(prev), prev, tz);
    }
    case "last_7_days":
      return localRange(addDays(today, -6), today, tz);
    case "last_30_days":
      return localRange(addDays(today, -29), today, tz);
    case "custom": {
      if (!custom || !isLocalDate(custom.from) || !isLocalDate(custom.to)) {
        return localRange(today, today, tz);
      }
      const [from, to] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
      return localRange(from, to, tz);
    }
  }
}

/** The range of the same length immediately before `range` (for "Compare to previous period"). */
export function previousRange(range: DateRange, tz: string): DateRange {
  const len = diffDays(range.fromDate, range.toDate) + 1;
  const to = addDays(range.fromDate, -1);
  return localRange(addDays(to, -(len - 1)), to, tz);
}

// ---------- Display --------------------------------------------------

function inTz(instant: Date | string, tz: string): TZDate {
  const ms = typeof instant === "string" ? new Date(instant).getTime() : instant.getTime();
  return new TZDate(ms, tz);
}

/** "16:40" in the viewer's time zone. */
export function formatTime(instant: Date | string, tz: string): string {
  return dfFormat(inTz(instant, tz), "HH:mm");
}

/**
 * Timestamps in the viewer's time zone:
 * - under a minute: "Just now"
 * - under an hour: "2 min ago"
 * - today: "Today 16:40"
 * - yesterday: "Yesterday 16:40"
 * - older, this year: "12 Sep, 16:40"
 * - older, other year: "12 Sep 2025, 16:40"
 */
export function formatRelative(instant: Date | string, tz: string, now: Date = new Date()): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const diffMs = now.getTime() - d.getTime();
  if (diffMs >= 0 && diffMs < 60_000) return "Just now";
  if (diffMs >= 0 && diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} min ago`;
  const local = inTz(d, tz);
  const day = localDateOf(d, tz);
  const today = todayIn(tz, now);
  const time = dfFormat(local, "HH:mm");
  if (day === today) return `Today ${time}`;
  if (day === addDays(today, -1)) return `Yesterday ${time}`;
  if (day.slice(0, 4) === today.slice(0, 4)) return `${dfFormat(local, "d MMM")}, ${time}`;
  return `${dfFormat(local, "d MMM yyyy")}, ${time}`;
}

/** "12 Sep, 16:40" always absolute, in the viewer's time zone. */
export function formatDateTime(instant: Date | string, tz: string): string {
  return dfFormat(inTz(instant, tz), "d MMM, HH:mm");
}

/** A local date as "Thu 24 Sep" (adds the year when it isn't the current one). */
export function formatLocalDate(date: LocalDate, today?: LocalDate): string {
  const d = asUtcDay(date);
  const f = new TZDate(d.getTime(), "UTC");
  if (today && today.slice(0, 4) !== date.slice(0, 4)) return dfFormat(f, "EEE d MMM yyyy");
  return dfFormat(f, "EEE d MMM");
}

/** Short weekday of a local date: "Tue". */
export function weekdayShort(date: LocalDate): string {
  return dfFormat(new TZDate(asUtcDay(date).getTime(), "UTC"), "EEE");
}

/**
 * Label for a due date relative to the viewer's today:
 * "Today", "Yesterday", "Tomorrow", a weekday within the next 6 days ("Wed"),
 * otherwise "30 Sep".
 */
export function dueLabel(date: LocalDate, today: LocalDate): string {
  const diff = diffDays(today, date);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) return weekdayShort(date);
  const f = new TZDate(asUtcDay(date).getTime(), "UTC");
  return date.slice(0, 4) === today.slice(0, 4) ? dfFormat(f, "d MMM") : dfFormat(f, "d MMM yyyy");
}

export type DueState = "overdue" | "today" | "upcoming" | "none";

export function dueState(date: LocalDate | null | undefined, today: LocalDate): DueState {
  if (!date) return "none";
  if (date < today) return "overdue";
  if (date === today) return "today";
  return "upcoming";
}

/** Local wall-clock time in a time zone: "9:14 AM". */
export function localClock(tz: string, now: Date = new Date()): string {
  return dfFormat(new TZDate(now.getTime(), tz), "h:mm a");
}

/** Share (0–1) of the 09:00–18:00 working day elapsed in `tz` (docs/05, section 3). */
export function workdayElapsedShare(tz: string, now: Date = new Date()): number {
  const local = new TZDate(now.getTime(), tz);
  const minutes = local.getHours() * 60 + local.getMinutes();
  const share = (minutes - 9 * 60) / (9 * 60);
  return Math.min(1, Math.max(0, share));
}

// ---------- Local date-time inputs ------------------------------------------

const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2026-09-24T16:40" in `tz` → UTC instant. Null if malformed. */
export function localDateTimeToUtc(value: string, tz: string): Date | null {
  const m = DATETIME_RE.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return new Date(new TZDate(y, mo - 1, d, h, mi, 0, tz).getTime());
}

/** UTC instant → "2026-09-24T16:40" in `tz`, for datetime-local inputs. */
export function toLocalDateTimeInput(instant: Date | string, tz: string): string {
  return dfFormat(inTz(instant, tz), "yyyy-MM-dd'T'HH:mm");
}

export const MAX_BACKDATE_DAYS = 7;

// ---------- Two time zones (docs/09 section 3) ------------------------------

/** "America/New_York" → "New York"; "UTC" stays "UTC". */
export function zoneCity(tz: string): string {
  const last = tz.split("/").pop() ?? tz;
  return last.replace(/_/g, " ");
}

/** "Tue 30 Sep, 9:00 AM" in `tz`. */
export function formatDayTime(instant: Date | string, tz: string): string {
  return dfFormat(inTz(instant, tz), "EEE d MMM, h:mm a");
}

/** "9:00 AM" in `tz`. */
export function formatClock(instant: Date | string, tz: string): string {
  return dfFormat(inTz(instant, tz), "h:mm a");
}

/**
 * A post time in the audience's zone with the viewer's time next to it:
 * "Tue 30 Sep, 9:00 AM New York (6:00 PM your time)".
 * The viewer part adds the day when it differs ("(Wed 1 Oct, 2:00 AM your time)") and is left out
 * when both zones show the same wall-clock time.
 */
export function formatDualZone(instant: Date | string, audienceTz: string, viewerTz: string): string {
  const main = `${formatDayTime(instant, audienceTz)} ${zoneCity(audienceTz)}`;
  const aDay = localDateOf(typeof instant === "string" ? new Date(instant) : instant, audienceTz);
  const vDay = localDateOf(typeof instant === "string" ? new Date(instant) : instant, viewerTz);
  const aClock = formatClock(instant, audienceTz);
  const vClock = formatClock(instant, viewerTz);
  if (aDay === vDay && aClock === vClock) return main;
  const yours = aDay === vDay ? vClock : formatDayTime(instant, viewerTz);
  return `${main} (${yours} your time)`;
}

/** Time left until an instant: "in 2h 10m", "in 45m", "in 3d 4h"; past: "2h 10m ago"; under a minute: "now". */
export function formatCountdown(target: Date | string, now: Date = new Date()): string {
  const t = typeof target === "string" ? new Date(target).getTime() : target.getTime();
  const diff = t - now.getTime();
  const mins = Math.floor(Math.abs(diff) / 60_000);
  if (mins < 1) return "now";
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const text = d > 0 ? `${d}d${h ? ` ${h}h` : ""}` : h > 0 ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
  return diff > 0 ? `in ${text}` : `${text} ago`;
}

/** Move an instant by whole local days in `tz`, keeping its wall-clock time (DST-safe). */
export function shiftLocalDays(instant: Date | string, tz: string, days: number): Date {
  const local = toLocalDateTimeInput(instant, tz);
  const moved = `${addDays(local.slice(0, 10), days)}${local.slice(10)}`;
  return localDateTimeToUtc(moved, tz)!;
}
