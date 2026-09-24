import type { Metadata } from "next";
import { isLocalDate, todayIn } from "@/lib/dates";
import { requireViewer } from "@/server/auth";
import { getLists } from "@/server/queries/lists";
import { getMyTasks, getTasksForDay } from "@/server/queries/tasks";
import { FounderTasks } from "./founder-tasks";
import { MyTasks } from "./my-tasks";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  if (viewer.role !== "founder") {
    const { today, tasks } = await getMyTasks(viewer);
    return <MyTasks today={today} tasks={tasks} />;
  }
  const today = todayIn(viewer.timezone);
  const date = typeof sp.date === "string" && isLocalDate(sp.date) ? sp.date : today;
  const lists = await getLists();
  const active = lists.members.filter((m) => m.is_active);
  const data = await getTasksForDay(
    date,
    active.map((m) => m.id),
  );
  return (
    <FounderTasks
      date={date}
      today={today}
      tab={sp.tab === "repeating" ? "repeating" : "day"}
      openNew={sp.new === "1"}
      {...data}
    />
  );
}
