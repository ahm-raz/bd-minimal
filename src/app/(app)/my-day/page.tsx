import type { Metadata } from "next";
import { requireViewer } from "@/server/auth";
import { getMyDay } from "@/server/queries/my-day";
import { MyDayView } from "./my-day-view";

export const metadata: Metadata = { title: "My Day" };

export default async function MyDayPage() {
  const viewer = await requireViewer();
  const data = await getMyDay(viewer);
  return <MyDayView data={data} />;
}
