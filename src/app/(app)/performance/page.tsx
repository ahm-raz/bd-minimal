import type { Metadata } from "next";
import { requireViewer } from "@/server/auth";
import { getPerformance, parsePerformanceFilters } from "@/server/queries/performance";
import { getSocialPerformance } from "@/server/queries/social-metrics";
import { PerformanceView } from "./performance-view";
import { SocialPerformanceView } from "./social-view";
import { getDepartment } from "@/server/department";

export const metadata: Metadata = { title: "Performance" };

/** Sales for BDs, Social for social media managers; the founder switches with ?tab=social (docs/09 section 4). */
export default async function PerformancePage({ searchParams }: PageProps<"/performance">) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const { filters, range } = parsePerformanceFilters(sp, viewer);
  // The founder's department view fixes the tab; with All departments ?tab=social switches.
  const department = await getDepartment(viewer);
  const tab = department === "all" ? (sp.tab === "social" ? "social" : "sales") : department;
  if (tab === "social") {
    const data = await getSocialPerformance(viewer, filters, range);
    return <SocialPerformanceView data={data} filters={filters} range={range} />;
  }
  const data = await getPerformance(viewer, filters, range);
  return <PerformanceView data={data} />;
}
