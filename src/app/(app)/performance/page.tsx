import type { Metadata } from "next";
import { requireViewer } from "@/server/auth";
import { getPerformance, parsePerformanceFilters } from "@/server/queries/performance";
import { getSocialPerformance } from "@/server/queries/social-metrics";
import { PerformanceView } from "./performance-view";
import { SocialPerformanceView } from "./social-view";

export const metadata: Metadata = { title: "Performance" };

/** Sales for BDs, Social for social media managers; the founder switches with ?tab=social (docs/09 section 4). */
export default async function PerformancePage({ searchParams }: PageProps<"/performance">) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const { filters, range } = parsePerformanceFilters(sp, viewer);
  const tab = viewer.role === "social" ? "social" : viewer.role === "founder" && sp.tab === "social" ? "social" : "sales";
  if (tab === "social") {
    const data = await getSocialPerformance(viewer, filters, range);
    return <SocialPerformanceView data={data} filters={filters} range={range} />;
  }
  const data = await getPerformance(viewer, filters, range);
  return <PerformanceView data={data} />;
}
