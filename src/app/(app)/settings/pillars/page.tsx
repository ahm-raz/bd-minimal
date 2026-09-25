import type { Metadata } from "next";
import { getLists } from "@/server/queries/lists";
import { PillarsEditor } from "./pillars-editor";

export const metadata: Metadata = { title: "Settings" };

export default async function PillarsPage() {
  const lists = await getLists();
  return <PillarsEditor pillars={lists.pillars} />;
}
