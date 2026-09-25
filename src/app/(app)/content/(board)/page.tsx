import type { Metadata } from "next";
import { addDays, endOfMonth, isLocalDate, startOfMonth, startOfWeek, todayIn } from "@/lib/dates";
import { POST_STATUSES, type PostStatus } from "@/lib/social";
import { requireViewer } from "@/server/auth";
import { getIdeas, getNeedsReview, getPosts, refreshPosts, type ContentFilters } from "@/server/queries/content";
import { ContentView, type ContentViewMode } from "./content-view";

export const metadata: Metadata = { title: "Content" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIEWS: ContentViewMode[] = ["week", "month", "list", "review"];

/** Content (docs/09 section 4): founder sees every post, a social media manager sees their own (RLS). */
export default async function ContentPage({ searchParams }: PageProps<"/content">) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const id = (k: string) => (one(k) && UUID.test(one(k)!) ? one(k)! : null);

  const founder = viewer.role === "founder";
  const today = todayIn(viewer.timezone);
  let view = (VIEWS as string[]).includes(one("view") ?? "") ? (one("view") as ContentViewMode) : "week";
  if (view === "review" && !founder) view = "week";
  const anchor = one("date") && isLocalDate(one("date")!) ? one("date")! : today;

  const [from, to] =
    view === "week"
      ? [startOfWeek(anchor), addDays(startOfWeek(anchor), 6)]
      : view === "month"
        ? [startOfWeek(startOfMonth(anchor)), addDays(startOfWeek(endOfMonth(anchor)), 6)]
        : [startOfMonth(anchor), endOfMonth(anchor)];

  const status = one("status");
  const filters: ContentFilters = {
    account: id("account"),
    assignee: founder ? id("assignee") : null,
    status: status && (POST_STATUSES as string[]).includes(status) ? (status as PostStatus) : null,
    pillar: id("pillar"),
  };

  await refreshPosts(viewer, from, to);
  const [posts, ideas, review] = await Promise.all([
    view === "review" ? Promise.resolve([]) : getPosts(viewer, from, to, filters),
    getIdeas(filters),
    founder ? getNeedsReview() : Promise.resolve([]),
  ]);

  return (
    <ContentView
      view={view}
      anchor={anchor}
      today={today}
      range={{ from, to }}
      filters={filters}
      posts={posts}
      ideas={ideas}
      review={review}
      openPostId={id("post")}
      openNew={one("new") === "1"}
      openIdea={one("idea") === "1"}
    />
  );
}
