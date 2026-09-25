import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays, localRange, todayIn, type LocalDate } from "@/lib/dates";
import { SLOT_HORIZON_DAYS, type PostCommentKind, type PostFormat, type PostStatus } from "@/lib/social";
import type { Viewer } from "@/server/auth";

export type PostItem = {
  id: string;
  accountId: string;
  assigneeId: string;
  createdBy: string;
  scheduleId: string | null;
  title: string;
  brief: string | null;
  pillarId: string | null;
  format: PostFormat;
  campaignId: string | null;
  scheduledAt: string | null;
  timezone: string;
  draftDueAt: string | null;
  needsApproval: boolean;
  status: PostStatus;
  caption: string | null;
  hashtags: string | null;
  firstComment: string | null;
  ctaLink: string | null;
  mediaLinks: string[];
  postedAt: string | null;
  postUrl: string | null;
  impressions: number | null;
  reactions: number | null;
  commentsCount: number | null;
  shares: number | null;
  clicks: number | null;
  resultsRecordedAt: string | null;
  updatedAt: string;
};

export type PostComment = {
  id: string;
  authorId: string | null;
  kind: PostCommentKind;
  body: string;
  createdAt: string;
};

export type PostEvent = { id: number; from: PostStatus | null; to: PostStatus; by: string | null; at: string };

export const POST_COLUMNS =
  "id, account_id, assignee_id, created_by, schedule_id, title, brief, pillar_id, format, campaign_id, scheduled_at, timezone, draft_due_at, needs_approval, status, caption, hashtags, first_comment, cta_link, media_links, posted_at, post_url, impressions, reactions, comments_count, shares, clicks, results_recorded_at, updated_at";

type PostRow = {
  id: string;
  account_id: string;
  assignee_id: string;
  created_by: string;
  schedule_id: string | null;
  title: string;
  brief: string | null;
  pillar_id: string | null;
  format: PostFormat;
  campaign_id: string | null;
  scheduled_at: string | null;
  timezone: string | null;
  draft_due_at: string | null;
  needs_approval: boolean;
  status: PostStatus;
  caption: string | null;
  hashtags: string | null;
  first_comment: string | null;
  cta_link: string | null;
  media_links: string[];
  posted_at: string | null;
  post_url: string | null;
  impressions: number | null;
  reactions: number | null;
  comments_count: number | null;
  shares: number | null;
  clicks: number | null;
  results_recorded_at: string | null;
  updated_at: string;
};

export function toPost(r: PostRow): PostItem {
  return {
    id: r.id,
    accountId: r.account_id,
    assigneeId: r.assignee_id,
    createdBy: r.created_by,
    scheduleId: r.schedule_id,
    title: r.title,
    brief: r.brief,
    pillarId: r.pillar_id,
    format: r.format,
    campaignId: r.campaign_id,
    scheduledAt: r.scheduled_at,
    timezone: r.timezone ?? "UTC",
    draftDueAt: r.draft_due_at,
    needsApproval: r.needs_approval,
    status: r.status,
    caption: r.caption,
    hashtags: r.hashtags,
    firstComment: r.first_comment,
    ctaLink: r.cta_link,
    mediaLinks: r.media_links ?? [],
    postedAt: r.posted_at,
    postUrl: r.post_url,
    impressions: r.impressions,
    reactions: r.reactions,
    commentsCount: r.comments_count,
    shares: r.shares,
    clicks: r.clicks,
    resultsRecordedAt: r.results_recorded_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Housekeeping that runs on page load, since there are no background jobs (docs/09 section 3):
 * posts 2 hours past their time become missed, and recurring slots exist for the dates being viewed
 * (never more than 28 days ahead). Both functions are idempotent. Only the founder and social media
 * managers have schedules, so BDs skip the slot step.
 */
export async function refreshPosts(viewer: Viewer, from?: LocalDate, to?: LocalDate) {
  if (viewer.role === "bd") return;
  const supabase = await createClient();
  await supabase.rpc("mark_missed_posts");
  const today = todayIn(viewer.timezone);
  const start = from && from > today ? addDays(from, -1) : addDays(today, -1);
  const horizon = addDays(today, SLOT_HORIZON_DAYS);
  const end = to && to < horizon ? addDays(to, 1) : horizon;
  if (end >= start) await supabase.rpc("ensure_post_slots", { p_from: start, p_to: end });
}

export type ContentFilters = {
  account: string | null;
  assignee: string | null;
  status: PostStatus | null;
  pillar: string | null;
};

/** Posts scheduled in the viewer's local date range; RLS limits a social media manager to their own. */
export async function getPosts(viewer: Viewer, from: LocalDate, to: LocalDate, filters: ContentFilters): Promise<PostItem[]> {
  const supabase = await createClient();
  const range = localRange(from, to, viewer.timezone);
  let q = supabase
    .from("posts")
    .select(POST_COLUMNS)
    .gte("scheduled_at", range.fromUtc)
    .lt("scheduled_at", range.toUtc)
    .order("scheduled_at")
    .limit(1000);
  if (filters.account) q = q.eq("account_id", filters.account);
  if (filters.assignee) q = q.eq("assignee_id", filters.assignee);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.pillar) q = q.eq("pillar_id", filters.pillar);
  const { data } = await q;
  return (data ?? []).map(toPost);
}

/** Ideas have no time yet; they wait in their own list until the founder schedules them. */
export async function getIdeas(filters: Pick<ContentFilters, "account" | "assignee" | "pillar">): Promise<PostItem[]> {
  const supabase = await createClient();
  let q = supabase.from("posts").select(POST_COLUMNS).eq("status", "idea").order("created_at", { ascending: false }).limit(200);
  if (filters.account) q = q.eq("account_id", filters.account);
  if (filters.assignee) q = q.eq("assignee_id", filters.assignee);
  if (filters.pillar) q = q.eq("pillar_id", filters.pillar);
  const { data } = await q;
  return (data ?? []).map(toPost);
}

/** Posts waiting for the founder's review, oldest submission first. */
export async function getNeedsReview(): Promise<PostItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select(POST_COLUMNS)
    .eq("status", "in_review")
    .order("updated_at", { ascending: true })
    .limit(200);
  return (data ?? []).map(toPost);
}

/** For the Content nav badge (founder). */
export async function needsReviewCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("posts").select("id", { count: "exact", head: true }).eq("status", "in_review");
  return count ?? 0;
}

export async function getPostDetail(
  id: string,
): Promise<{ post: PostItem; comments: PostComment[]; events: PostEvent[] } | null> {
  const supabase = await createClient();
  const [post, comments, events] = await Promise.all([
    supabase.from("posts").select(POST_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("post_comments").select("id, author_id, kind, body, created_at").eq("post_id", id).order("created_at"),
    supabase
      .from("post_status_events")
      .select("id, from_status, to_status, changed_by, changed_at")
      .eq("post_id", id)
      .order("changed_at"),
  ]);
  if (!post.data) return null;
  return {
    post: toPost(post.data),
    comments: (comments.data ?? []).map((c) => ({
      id: c.id,
      authorId: c.author_id,
      kind: c.kind,
      body: c.body,
      createdAt: c.created_at,
    })),
    events: (events.data ?? []).map((e) => ({
      id: e.id,
      from: e.from_status,
      to: e.to_status,
      by: e.changed_by,
      at: e.changed_at,
    })),
  };
}

export type ScheduleItem = {
  id: string;
  accountId: string;
  assigneeId: string;
  weekdays: number[];
  localTime: string;
  timezone: string;
  pillarId: string | null;
  defaultFormat: PostFormat;
  needsApproval: boolean;
  draftLeadHours: number;
  startsOn: string;
  endsOn: string | null;
  isActive: boolean;
};

export async function getSchedules(): Promise<ScheduleItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posting_schedules")
    .select(
      "id, account_id, assignee_id, weekdays, local_time, timezone, pillar_id, default_format, needs_approval, draft_lead_hours, starts_on, ends_on, is_active",
    )
    .order("is_active", { ascending: false })
    .order("created_at");
  return (data ?? []).map((s) => ({
    id: s.id,
    accountId: s.account_id,
    assigneeId: s.assignee_id,
    weekdays: s.weekdays,
    localTime: s.local_time.slice(0, 5),
    timezone: s.timezone,
    pillarId: s.pillar_id,
    defaultFormat: s.default_format,
    needsApproval: s.needs_approval,
    draftLeadHours: s.draft_lead_hours,
    startsOn: s.starts_on,
    endsOn: s.ends_on,
    isActive: s.is_active,
  }));
}

export type SocialDay = {
  today: string;
  todayPosts: PostItem[];
  draftsDue: PostItem[];
  changesRequested: PostItem[];
  postedToday: number;
  weeklyTarget: number | null;
};

/**
 * My Day for a social media manager (docs/09 section 4). Posts are theirs by RLS; the posted count comes
 * from social_daily, in the viewer's time zone.
 */
export async function getSocialDay(viewer: Viewer): Promise<SocialDay> {
  await refreshPosts(viewer);
  const supabase = await createClient();
  const today = todayIn(viewer.timezone);
  const range = localRange(today, today, viewer.timezone);
  const now = new Date();
  const soon = new Date(now.getTime() + 48 * 3_600_000).toISOString();
  const [todays, drafts, changes, daily, target] = await Promise.all([
    supabase
      .from("posts")
      .select(POST_COLUMNS)
      .eq("assignee_id", viewer.id)
      .gte("scheduled_at", range.fromUtc)
      .lt("scheduled_at", range.toUtc)
      .neq("status", "cancelled")
      .order("scheduled_at"),
    supabase
      .from("posts")
      .select(POST_COLUMNS)
      .eq("assignee_id", viewer.id)
      .in("status", ["planned", "drafting"])
      .lte("draft_due_at", soon)
      .gt("scheduled_at", now.toISOString())
      .order("draft_due_at"),
    supabase.from("posts").select(POST_COLUMNS).eq("assignee_id", viewer.id).eq("status", "changes_requested").order("scheduled_at"),
    supabase.rpc("social_daily", { p_from: today, p_to: today, p_tz: viewer.timezone, p_user: viewer.id }),
    supabase.from("targets").select("weekly_value").eq("user_id", viewer.id).eq("metric", "posts_published").maybeSingle(),
  ]);
  return {
    today,
    todayPosts: (todays.data ?? []).map(toPost),
    draftsDue: (drafts.data ?? []).map(toPost),
    changesRequested: (changes.data ?? []).map(toPost),
    postedToday: (daily.data ?? []).reduce((n, r) => n + r.posted, 0),
    weeklyTarget: target.data?.weekly_value ?? null,
  };
}

/** Founder's My Day blocks: posts waiting for review, and today's posts across every account. */
export async function getFounderSocialDay(viewer: Viewer): Promise<{ review: PostItem[]; todayPosts: PostItem[] }> {
  await refreshPosts(viewer);
  const supabase = await createClient();
  const today = todayIn(viewer.timezone);
  const range = localRange(today, today, viewer.timezone);
  const [review, todays] = await Promise.all([
    getNeedsReview(),
    supabase
      .from("posts")
      .select(POST_COLUMNS)
      .gte("scheduled_at", range.fromUtc)
      .lt("scheduled_at", range.toUtc)
      .neq("status", "cancelled")
      .order("scheduled_at"),
  ]);
  return { review, todayPosts: (todays.data ?? []).map(toPost) };
}
