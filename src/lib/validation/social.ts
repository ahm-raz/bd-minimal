import { z } from "zod";
import { isLocalDate, isValidTimeZone } from "@/lib/dates";
import { PLATFORMS, POST_FORMATS, type PostFormat, type SocialPlatform } from "@/lib/social";

/** Forms of the social media module (docs/09). Each schema is shared by the form and its server action. */

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const HTTP_URL = /^https?:\/\/[^\s/]+\.[^\s]+$/i;

const optionalId = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullable()
    .optional()
    .transform((v) => v || null);

const optionalUrl = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || HTTP_URL.test(v), "Enter a full link starting with https://.");

const title = z.string().trim().min(2, "Give the post a title.").max(120, "Keep the title under 120 characters.");
const format = z.enum(POST_FORMATS as [PostFormat, ...PostFormat[]], "Pick a format.");

// ---------- Posts -----------------------------------------------------------

/** Brief (founder). `scheduledLocal` is entered in the account's audience time zone. */
export const postBriefSchema = z.object({
  id: z.string().optional(),
  accountId: z.string().min(1, "Pick an account.").pipe(z.uuid("Pick an account.")),
  assigneeId: z.string().min(1, "Pick who writes it.").pipe(z.uuid("Pick who writes it.")),
  scheduledLocal: z.string().regex(LOCAL_DATETIME, "Pick a date and time."),
  title,
  brief: optionalText(4000, "Keep the brief under 4,000 characters."),
  pillarId: optionalId,
  format,
  campaignId: optionalId,
  needsApproval: z.boolean(),
});
export type PostBriefValues = z.input<typeof postBriefSchema>;

/** Suggest an idea (SMM): no time yet; the founder schedules it. */
export const ideaSchema = z.object({
  accountId: z.string().min(1, "Pick an account.").pipe(z.uuid("Pick an account.")),
  title,
  brief: optionalText(4000, "Keep the notes under 4,000 characters."),
  pillarId: optionalId,
  format,
});
export type IdeaValues = z.input<typeof ideaSchema>;

export const MAX_MEDIA_LINKS = 10;

/** Work (SMM): what gets posted. Character limits are warnings in the form, not errors. */
export const postWorkSchema = z.object({
  id: z.uuid(),
  caption: optionalText(63206, "That caption is longer than any platform allows."),
  hashtags: optionalText(500, "Keep hashtags under 500 characters."),
  firstComment: optionalText(2000, "Keep the first comment under 2,000 characters."),
  ctaLink: optionalUrl,
  mediaLinks: z
    .array(z.string().trim())
    .max(MAX_MEDIA_LINKS, `Add up to ${MAX_MEDIA_LINKS} links.`)
    .transform((links) => links.filter(Boolean))
    .refine((links) => links.every((l) => HTTP_URL.test(l)), "Each media link must start with https://."),
});
export type PostWorkValues = z.input<typeof postWorkSchema>;

/** Reschedule by drag: move by whole days, keeping the local time in the post's zone. */
export const rescheduleSchema = z.object({
  id: z.uuid(),
  shiftDays: z.number().int().min(-366).max(366).refine((n) => n !== 0, "Drop it on another day."),
});

export const POSTED_BACKDATE_HOURS = 24;

/** Posted time (an instant) must be within the last 24 hours and not in the future. */
export function postedAtError(postedAt: Date, now: Date = new Date()): string | null {
  if (postedAt.getTime() > now.getTime() + 5 * 60_000) return "The posted time can't be in the future.";
  if (postedAt.getTime() < now.getTime() - POSTED_BACKDATE_HOURS * 3_600_000) {
    return "Use a time within the last 24 hours.";
  }
  return null;
}

/** Mark as posted. `postedLocal` is in the viewer's time zone; empty means now. */
export const markPostedSchema = z.object({
  id: z.uuid(),
  postUrl: z
    .string()
    .trim()
    .min(1, "Add the live post link to mark it as posted.")
    .refine((v) => HTTP_URL.test(v), "Enter the full link to the live post, starting with https://."),
  postedLocal: z
    .string()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || LOCAL_DATETIME.test(v), "Pick a date and time."),
});
export type MarkPostedValues = z.input<typeof markPostedSchema>;

const resultCount = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v, ctx) => {
    const s = String(v ?? "").replace(/,/g, "").trim();
    if (!s) return null;
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Use a whole number, 0 or more." });
      return z.NEVER;
    }
    return n;
  });

export const resultsSchema = z.object({
  id: z.uuid(),
  impressions: resultCount,
  reactions: resultCount,
  commentsCount: resultCount,
  shares: resultCount,
  clicks: resultCount,
});
export type ResultsValues = z.input<typeof resultsSchema>;

export const commentSchema = z.object({
  postId: z.uuid(),
  body: z.string().trim().min(1, "Write a comment first.").max(2000, "Keep it under 2,000 characters."),
});

export const requestChangesSchema = z.object({
  postId: z.uuid(),
  body: z.string().trim().min(1, "Say what needs to change.").max(2000, "Keep it under 2,000 characters."),
});

export const postIdSchema = z.object({ id: z.uuid() });

// ---------- Schedules ---------------------------------------------------------

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const WEEKDAY_SHORT: Record<number, string> = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" };

export const scheduleSchema = z
  .object({
    id: z.string().optional(),
    accountId: z.string().min(1, "Pick an account.").pipe(z.uuid("Pick an account.")),
    assigneeId: z.string().min(1, "Pick who posts.").pipe(z.uuid("Pick who posts.")),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1, "Pick at least one day."),
    localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time."),
    timezone: z.string().refine(isValidTimeZone, "Pick a time zone."),
    pillarId: optionalId,
    defaultFormat: format,
    needsApproval: z.boolean(),
    draftLeadHours: z
      .union([z.string(), z.number()])
      .transform((v, ctx) => {
        const n = Number(String(v).trim());
        if (String(v).trim() === "" || !Number.isInteger(n) || n < 0 || n > 336) {
          ctx.addIssue({ code: "custom", message: "Use 0 to 336 hours." });
          return z.NEVER;
        }
        return n;
      }),
    startsOn: z.string().refine(isLocalDate, "Pick a start date."),
    endsOn: z
      .string()
      .nullable()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || isLocalDate(v), "Pick an end date or leave it empty."),
  })
  .superRefine((v, ctx) => {
    if (v.endsOn && v.endsOn < v.startsOn) {
      ctx.addIssue({ code: "custom", path: ["endsOn"], message: "The end date must be on or after the start date." });
    }
  });
export type ScheduleValues = z.input<typeof scheduleSchema>;

// ---------- Social accounts -------------------------------------------------

export const socialAccountSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Use at least 2 characters.").max(80, "Keep it under 80 characters."),
  platform: z.enum(PLATFORMS as [SocialPlatform, ...SocialPlatform[]], "Pick a platform."),
  profileUrl: optionalUrl,
  audienceTimezone: z.string().refine(isValidTimeZone, "Pick a time zone."),
  isActive: z.boolean(),
});
export type SocialAccountValues = z.input<typeof socialAccountSchema>;
