import type { Metadata } from "next";
import { requireViewer } from "@/server/auth";
import { getMyDay } from "@/server/queries/my-day";
import { getMyDayTasks } from "@/server/queries/tasks";
import { getLists } from "@/server/queries/lists";
import { getFounderSocialDay, getSocialDay } from "@/server/queries/content";
import { getUpcomingMeetings } from "@/server/queries/meetings";
import { getMyCalendarStatus } from "@/server/queries/calendar";
import { MyDayView } from "./my-day-view";
import { SocialDayView } from "./social-day";
import { getDepartment } from "@/server/department";
import { showsSales, showsSocial } from "@/lib/department";

export const metadata: Metadata = { title: "My Day" };

export default async function MyDayPage() {
  const viewer = await requireViewer();
  // Tasks first: ensure_recurring_tasks creates today's repeating tasks before anything is read.
  const tasks = await getMyDayTasks(viewer);
  const lists = await getLists();
  const founder = lists.members.find((m) => m.role === "founder");
  const founderName = founder?.full_name?.split(" ")[0] || "the founder";

  if (viewer.role === "social") {
    return <SocialDayView data={await getSocialDay(viewer)} tasks={tasks.tasks} founderName={founderName} />;
  }
  // The founder's department view decides which half of the day to load (src/lib/department.ts).
  const department = await getDepartment(viewer);
  const sales = showsSales(department);
  const [data, social, meetings, calendar] = await Promise.all([
    sales ? getMyDay(viewer) : null,
    viewer.role === "founder" && showsSocial(department) && lists.socialAccounts.length > 0
      ? getFounderSocialDay(viewer)
      : null,
    sales ? getUpcomingMeetings(7) : [],
    sales ? getMyCalendarStatus() : null,
  ]);
  return (
    <MyDayView
      today={tasks.today}
      data={data}
      tasks={tasks.tasks}
      founderName={founderName}
      social={social}
      meetings={meetings}
      calendar={calendar}
    />
  );
}
