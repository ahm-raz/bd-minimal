import type { Metadata } from "next";
import { requireViewer } from "@/server/auth";
import { getPerformance, parsePerformanceFilters } from "@/server/queries/performance";
import { PerformanceView } from "./performance-view";

export const metadata: Metadata = { title: "Performance" };

export default async function PerformancePage({ searchParams }: PageProps<"/performance">) {
  const viewer = await requireViewer();
  const { filters, range } = parsePerformanceFilters(await searchParams, viewer);
  const data = await getPerformance(viewer, filters, range);
  return <PerformanceView data={data} />;
}
