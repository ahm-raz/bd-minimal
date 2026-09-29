import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocalDate, RANGE_PRESETS, rangeFor, type RangePreset } from "@/lib/dates";
import { FEED_GROUP_KEYS, effectiveFeedGroups, type FeedGroup } from "@/lib/feed";
import { getDepartment } from "@/server/department";
import { requireFounder, requireViewer } from "@/server/auth";
import { loadFeed } from "@/server/actions/feed";
import { refreshPosts } from "@/server/queries/content";
import { FeedView } from "./feed-view";

export const metadata: Metadata = { title: "Feed" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FeedPage({ searchParams }: PageProps<"/feed">) {
  const viewer = await requireViewer();
  if (!(await requireFounder())) notFound();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const preset = (RANGE_PRESETS as readonly string[]).includes(one("range") ?? "")
    ? (one("range") as RangePreset)
    : "today";
  const from = one("from");
  const to = one("to");
  const range =
    preset === "custom" && from && to && isLocalDate(from) && isLocalDate(to)
      ? rangeFor("custom", viewer.timezone, new Date(), { from, to })
      : rangeFor(preset === "custom" ? "today" : preset, viewer.timezone);
  const person = one("person") && UUID.test(one("person")!) ? one("person")! : null;
  const groups = (one("types") ?? "")
    .split(",")
    .filter((g): g is FeedGroup => (FEED_GROUP_KEYS as string[]).includes(g));

  // No background jobs: late posts become missed (with their feed event) when someone looks.
  await refreshPosts(viewer);
  const department = await getDepartment(viewer);
  const res = await loadFeed({
    fromUtc: range.fromUtc,
    toUtc: range.toUtc,
    person,
    groups: effectiveFeedGroups(groups, department),
  });
  return (
    <FeedView
      initial={res.ok ? res.data : []}
      error={res.ok ? null : res.error}
      filters={{ preset, from: range.fromDate, to: range.toDate, person, groups }}
      range={{ fromUtc: range.fromUtc, toUtc: range.toUtc }}
    />
  );
}
