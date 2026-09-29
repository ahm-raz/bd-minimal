import type { Database } from "@/lib/database.types";
import type { Role } from "@/lib/domain";
import { addDays, isoWeekday, isValidTimeZone, localDateTimeToUtc, todayIn } from "@/lib/dates";

/** Social media module labels, tones and rules the UI mirrors from SQL (docs/09). */

type Enums = Database["public"]["Enums"];
export type SocialPlatform = Enums["social_platform"];
export type PostFormat = Enums["post_format"];
export type PostStatus = Enums["post_status"];
export type PostCommentKind = Enums["post_comment_kind"];

export const PLATFORMS: SocialPlatform[] = [
  "linkedin_page",
  "linkedin_profile",
  "instagram",
  "facebook",
  "x",
  "tiktok",
  "youtube",
  "other",
];

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  linkedin_page: "LinkedIn page",
  linkedin_profile: "LinkedIn profile",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  tiktok: "TikTok",
  youtube: "YouTube",
  other: "Other",
};

/** Short platform mark for chips (lucide-react no longer ships brand icons). */
export const PLATFORM_SHORT: Record<SocialPlatform, string> = {
  linkedin_page: "LI",
  linkedin_profile: "LI",
  instagram: "IG",
  facebook: "FB",
  x: "X",
  tiktok: "TT",
  youtube: "YT",
  other: "Web",
};

export const POST_FORMATS: PostFormat[] = ["text", "image", "carousel", "video", "reel", "story", "article", "poll"];

export const FORMAT_LABELS: Record<PostFormat, string> = {
  text: "Text",
  image: "Image",
  carousel: "Carousel",
  video: "Video",
  reel: "Reel",
  story: "Story",
  article: "Article",
  poll: "Poll",
};

/** Formats that can be submitted with media links instead of a caption. */
export const MEDIA_FORMATS: PostFormat[] = ["image", "carousel", "video", "reel", "story"];

export const POST_STATUSES: PostStatus[] = [
  "idea",
  "planned",
  "drafting",
  "in_review",
  "changes_requested",
  "approved",
  "posted",
  "missed",
  "cancelled",
];

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  idea: "Idea",
  planned: "Planned",
  drafting: "Drafting",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  posted: "Posted",
  missed: "Missed",
  cancelled: "Cancelled",
};

/** Status chip colours (docs/09 section 4). */
export const POST_STATUS_TONE = {
  idea: "neutral",
  planned: "neutral",
  drafting: "accent",
  in_review: "warn",
  changes_requested: "warn",
  approved: "meeting",
  posted: "ok",
  missed: "bad",
  cancelled: "muted",
} as const satisfies Record<PostStatus, string>;

/** Dot colour classes for the month view. */
export const POST_STATUS_DOT: Record<PostStatus, string> = {
  idea: "bg-line",
  planned: "bg-ink-faint",
  drafting: "bg-accent",
  in_review: "bg-warn",
  changes_requested: "bg-warn",
  approved: "bg-stage-meeting-ink",
  posted: "bg-ok",
  missed: "bg-bad",
  cancelled: "bg-line",
};

export const COMMENT_KIND_LABELS: Record<PostCommentKind, string> = {
  comment: "Comment",
  change_request: "Changes requested",
  approval: "Approved",
  status_note: "Status note",
};

// ---------- Character limits (warning only) ---------------------------------

/**
 * Caption limits per platform. Verify current limits now and then; platforms change them.
 * Checked Sep 2026: X 280 (standard accounts), LinkedIn 3,000, Instagram 2,200, Facebook 63,206,
 * TikTok 2,200, YouTube description 5,000.
 */
export const CHAR_LIMITS: Partial<Record<SocialPlatform, number>> = {
  x: 280,
  linkedin_page: 3000,
  linkedin_profile: 3000,
  instagram: 2200,
  facebook: 63206,
  tiktok: 2200,
  youtube: 5000,
};

export type CounterTone = "ok" | "warn" | "bad";

/** Amber at 90% of the limit, red above it. */
export function charCounterTone(length: number, limit: number | undefined): CounterTone {
  if (!limit) return "ok";
  if (length > limit) return "bad";
  if (length >= limit * 0.9) return "warn";
  return "ok";
}

// ---------- Actions ---------------------------------------------------------

export type PostAction =
  | "schedule"
  | "start_drafting"
  | "submit"
  | "approve"
  | "request_changes"
  | "mark_posted"
  | "cancel"
  | "add_results";

export const POST_ACTION_LABELS: Record<PostAction, string> = {
  schedule: "Schedule",
  start_drafting: "Start drafting",
  submit: "Submit for review",
  approve: "Approve",
  request_changes: "Request changes",
  mark_posted: "Mark as posted",
  cancel: "Cancel post",
  add_results: "Add results",
};

/**
 * Actions the viewer can take on a post. Mirrors guard_post_write in SQL, which stays the authority:
 * the assignee moves the post along; only the founder schedules ideas, reviews and cancels.
 * The founder can also make the assignee's moves, to help out.
 */
export function allowedPostActions(input: {
  role: Role;
  isAssignee: boolean;
  status: PostStatus;
  needsApproval: boolean;
}): PostAction[] {
  const founder = input.role === "founder";
  if (!founder && !input.isAssignee) return [];
  const out: PostAction[] = [];
  switch (input.status) {
    case "idea":
      if (founder) out.push("schedule");
      break;
    case "planned":
      out.push("start_drafting");
      break;
    case "drafting":
      out.push(input.needsApproval ? "submit" : "mark_posted");
      if (!input.needsApproval) out.push("submit");
      break;
    case "changes_requested":
      out.push("submit");
      break;
    case "in_review":
      if (founder) out.push("approve", "request_changes");
      break;
    case "approved":
    case "missed":
      out.push("mark_posted");
      break;
    case "posted":
      out.push("add_results");
      break;
    case "cancelled":
      break;
  }
  if (founder && input.status !== "cancelled" && input.status !== "posted") out.push("cancel");
  return out;
}

/** The SMM edits the work fields while the post is still being written or waiting to go out. */
export function canEditWork(input: { role: Role; isAssignee: boolean; status: PostStatus }): boolean {
  if (input.role !== "founder" && !input.isAssignee) return false;
  return !["posted", "cancelled"].includes(input.status);
}

/** On time = posted within 60 minutes of the scheduled time (docs/09 section 3). */
export const ON_TIME_MINUTES = 60;
/** Posts go to missed this long after their time (mark_missed_posts). */
export const MISSED_AFTER_HOURS = 2;
/** "Add results" is nudged this long after posting. */
export const RESULTS_NUDGE_HOURS = 48;
/** Content creates recurring slots this far ahead (ensure_post_slots cap). */
export const SLOT_HORIZON_DAYS = 28;

export function isLate(scheduledAt: string, postedAt: string): boolean {
  return new Date(postedAt).getTime() > new Date(scheduledAt).getTime() + ON_TIME_MINUTES * 60_000;
}

/**
 * The next `count` slot times of a schedule after `now`, for the "Next 3 posts" preview.
 * Mirrors ensure_post_slots: matching ISO weekdays, local_time in the schedule's zone, DST-safe.
 */
export function nextSlots(
  s: { weekdays: number[]; localTime: string; timezone: string; startsOn: string; endsOn: string | null },
  now: Date = new Date(),
  count = 3,
): Date[] {
  const out: Date[] = [];
  if (!s.weekdays.length || !/^\d{2}:\d{2}$/.test(s.localTime) || !isValidTimeZone(s.timezone)) return out;
  const today = todayIn(s.timezone, now);
  let day = s.startsOn > today ? s.startsOn : today;
  for (let i = 0; i < 400 && out.length < count; i++, day = addDays(day, 1)) {
    if (s.endsOn && day > s.endsOn) break;
    if (!s.weekdays.includes(isoWeekday(day))) continue;
    const at = localDateTimeToUtc(`${day}T${s.localTime}`, s.timezone);
    if (at && at.getTime() > now.getTime()) out.push(at);
  }
  return out;
}
