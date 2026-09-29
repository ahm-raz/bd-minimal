import type { Metadata } from "next";
import { isLocalDate, todayIn } from "@/lib/dates";
import { requireViewer } from "@/server/auth";
import { getLists } from "@/server/queries/lists";
import { getMyTasks, getTasksForDay } from "@/server/queries/tasks";
import { FounderTasks } from "./founder-tasks";
import { MyTasks } from "./my-tasks";
import { getDepartment } from "@/server/department";
import { inDepartment } from "@/lib/department";

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
  const [lists, department] = await Promise.all([getLists(), getDepartment(viewer)]);
  // The founder's department view: only that department's people and their tasks.
  const inView = new Set(lists.members.filter((m) => inDepartment(m.role, department)).map((m) => m.id));
  const active = lists.members.filter((m) => m.is_active && inView.has(m.id));
  const all = await getTasksForDay(
    date,
    active.map((m) => m.id),
  );
  const data = {
    day: all.day.filter((t) => inView.has(t.assigneeId)),
    overdue: all.overdue.filter((t) => inView.has(t.assigneeId)),
    templates: all.templates.filter((t) => inView.has(t.assigneeId)),
  };
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
