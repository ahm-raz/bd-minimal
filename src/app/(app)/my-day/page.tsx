import type { Metadata } from "next";
import { requireViewer } from "@/server/auth";
import { getMyDay } from "@/server/queries/my-day";
import { getMyDayTasks } from "@/server/queries/tasks";
import { getLists } from "@/server/queries/lists";
import { MyDayView } from "./my-day-view";

export const metadata: Metadata = { title: "My Day" };

export default async function MyDayPage() {
  const viewer = await requireViewer();
  // Tasks first: ensure_recurring_tasks creates today's repeating tasks before anything is read.
  const tasks = await getMyDayTasks(viewer);
  const [data, lists] = await Promise.all([getMyDay(viewer), getLists()]);
  const founder = lists.members.find((m) => m.role === "founder");
  return (
    <MyDayView data={data} tasks={tasks.tasks} founderName={founder?.full_name?.split(" ")[0] || "the founder"} />
  );
}
