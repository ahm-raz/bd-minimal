import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireFounder, requireViewer } from "@/server/auth";
import { getSchedules } from "@/server/queries/content";
import { SchedulesView } from "./schedules-view";

export const metadata: Metadata = { title: "Posting schedules" };

/** Posting schedules (docs/09 section 4): founder only. */
export default async function SchedulesPage() {
  await requireViewer();
  if (!(await requireFounder())) notFound();
  const schedules = await getSchedules();
  return <SchedulesView schedules={schedules} />;
}
