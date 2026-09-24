import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { getLeadDetail, toLeadFormValues } from "@/server/queries/lead-detail";
import { LeadPage } from "./lead-page";

export async function generateMetadata({ params }: PageProps<"/leads/[id]">): Promise<Metadata> {
  const { id } = await params;
  const detail = await getLeadDetail(id);
  return { title: detail?.lead.company_name ?? "Lead" };
}

/** A BD opening someone else's lead gets a 404: RLS returns nothing (docs/07 section 3). */
export default async function LeadDetailPage({ params }: PageProps<"/leads/[id]">) {
  await requireViewer();
  const { id } = await params;
  const detail = await getLeadDetail(id);
  if (!detail) notFound();
  return <LeadPage detail={detail} formValues={toLeadFormValues(detail.lead, detail.contacts)} />;
}
