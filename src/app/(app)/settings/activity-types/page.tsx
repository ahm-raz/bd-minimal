import type { Metadata } from "next";
import { getLists } from "@/server/queries/lists";
import { ActivityTypesEditor } from "./activity-types-editor";

export const metadata: Metadata = { title: "Settings" };

export default async function ActivityTypesPage() {
  const lists = await getLists();
  return <ActivityTypesEditor types={lists.activityTypes} channels={lists.channels} />;
}
