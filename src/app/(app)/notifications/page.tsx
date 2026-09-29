import type { Metadata } from "next";
import { requireViewer } from "@/server/auth";
import { getDepartment } from "@/server/department";
import { groupsFor } from "@/lib/notifications";
import { NotificationsView } from "./notifications-view";

export const metadata: Metadata = { title: "Notifications" };

/** Full notification history, every role (docs/10 section 4). */
export default async function NotificationsPage() {
  const viewer = await requireViewer();
  return <NotificationsView groups={groupsFor(viewer.role, await getDepartment(viewer))} />;
}
