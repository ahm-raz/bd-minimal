import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays, diffDays, type DateRange } from "@/lib/dates";
import type { Viewer } from "@/server/auth";
import { POST_COLUMNS, refreshPosts, toPost, type PostItem } from "@/server/queries/content";
import type { PerformanceFilters } from "@/server/queries/performance";

export type SocialRow = {
  user_id: string;
  planned: number;
  posted: number;
  on_time: number;
  late: number;
  missed: number;
  on_time_rate: number | null;
  changes_requested: number;
  median_approval_hours: number | null;
  impressions: number;
  reactions: number;
  comments: number;
  shares: number;
  clicks: number;
};

export type SocialDimensionRow = {
  dimension_id: string;
  dimension_name: string;
  planned: number;
  posted: number;
  on_time: number;
  missed: number;
  impressions: number;
  reactions: number;
  avg_reactions: number | null;
};

export type SocialDailyRow = { day: string; user_id: string; scheduled: number; posted: number; missed: number };

export type SocialPerformance = {
  rows: SocialRow[];
  byAccount: SocialDimensionRow[];
  byPillar: SocialDimensionRow[];
  daily: SocialDailyRow[];
  gridFrom: string;
  /** Posts in range that went out or were missed: the drill-down lists. */
  posts: PostItem[];
  targets: { user_id: string; weekly_value: number }[];
};

const MAX_GRID_DAYS = 31;

/** Performance → Social (docs/09 section 5). Every number comes from the social metric functions. */
export async function getSocialPerformance(viewer: Viewer, filters: PerformanceFilters, range: DateRange): Promise<SocialPerformance> {
  await refreshPosts(viewer);
  const supabase = await createClient();
  const person = filters.person;
  const gridFrom = diffDays(range.fromDate, range.toDate) >= MAX_GRID_DAYS ? addDays(range.toDate, -(MAX_GRID_DAYS - 1)) : range.fromDate;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  let postsQuery = supabase
    .from("posts")
    .select(POST_COLUMNS)
    .gte("scheduled_at", range.fromUtc)
    .lt("scheduled_at", range.toUtc)
    .in("status", ["posted", "missed"])
    .order("scheduled_at", { ascending: false })
    .limit(500);
  if (person) postsQuery = postsQuery.eq("assignee_id", person);

  const [rows, byAccount, byPillar, daily, posts, targets] = await Promise.all([
    supabase.rpc("social_metrics", { p_from: range.fromUtc, p_to: range.toUtc, ...(person ? { p_user: person } : {}) }),
    supabase.rpc("social_metrics_by", { p_from: range.fromUtc, p_to: range.toUtc, p_dimension: "account", ...(person ? { p_user: person } : {}) }),
    supabase.rpc("social_metrics_by", { p_from: range.fromUtc, p_to: range.toUtc, p_dimension: "pillar", ...(person ? { p_user: person } : {}) }),
    supabase.rpc("social_daily", { p_from: gridFrom, p_to: range.toDate, p_tz: viewer.timezone, ...(person ? { p_user: person } : {}) }),
    postsQuery,
    supabase.from("targets").select("user_id, weekly_value").eq("metric", "posts_published"),
  ]);
  if (rows.error) throw new Error(`Social numbers couldn't be loaded: ${rows.error.message}`);

  const dim = (data: typeof byAccount.data): SocialDimensionRow[] =>
    (data ?? []).map((d) => ({ ...d, impressions: Number(d.impressions), reactions: Number(d.reactions), avg_reactions: num(d.avg_reactions) }));

  return {
    rows: (rows.data ?? []).map((r) => ({
      ...r,
      on_time_rate: num(r.on_time_rate),
      median_approval_hours: num(r.median_approval_hours),
      impressions: Number(r.impressions),
      reactions: Number(r.reactions),
      comments: Number(r.comments),
      shares: Number(r.shares),
      clicks: Number(r.clicks),
    })),
    byAccount: dim(byAccount.data),
    byPillar: dim(byPillar.data),
    daily: daily.data ?? [],
    gridFrom,
    posts: (posts.data ?? []).map(toPost),
    targets: targets.data ?? [],
  };
}
