import type { Metadata } from "next";
import { getLists } from "@/server/queries/lists";
import { OutcomesEditor } from "./outcomes-editor";

export const metadata: Metadata = { title: "Settings" };

export default async function OutcomesPage() {
  const lists = await getLists();
  return <OutcomesEditor outcomes={lists.outcomes} stages={lists.stages} />;
}
