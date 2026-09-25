import type { Metadata } from "next";
import { requireViewer } from "@/server/auth";
import { getMyDay } from "@/server/queries/my-day";
import { getMyDayTasks } from "@/server/queries/tasks";
import { getLists } from "@/server/queries/lists";
import { getFounderSocialDay, getSocialDay } from "@/server/queries/content";
import { MyDayView } from "./my-day-view";
import { SocialDayView } from "./social-day";

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
  const [data, social] = await Promise.all([
    getMyDay(viewer),
    viewer.role === "founder" && lists.socialAccounts.length > 0 ? getFounderSocialDay(viewer) : null,
  ]);
  return <MyDayView data={data} tasks={tasks.tasks} founderName={founderName} social={social} />;
}
