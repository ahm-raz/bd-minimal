import type { Metadata } from "next";
import { requireViewer } from "@/server/auth";
import { fetchLeads } from "@/server/queries/leads";
import { parseLeadFilters } from "@/lib/lead-filters";
import { LeadsView } from "./leads-view";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const viewer = await requireViewer();
  const filters = parseLeadFilters(await searchParams, viewer.role === "founder");
  const { rows, total } = await fetchLeads(filters, viewer);
  return <LeadsView rows={rows} total={total} filters={filters} />;
}
