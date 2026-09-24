import type { Metadata } from "next";
import { requireViewer } from "@/server/auth";
import { fetchPipeline, fetchPipelineTotals, parsePipelineFilters } from "@/server/queries/pipeline";
import { PipelineView } from "./pipeline-view";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const viewer = await requireViewer();
  const filters = parsePipelineFilters(await searchParams, viewer.role === "founder");
  const [cards, totals] = await Promise.all([fetchPipeline(filters), fetchPipelineTotals(filters.owner)]);
  return <PipelineView cards={cards} totals={totals} filters={filters} />;
}
