import type { Metadata } from "next";
import { getLists } from "@/server/queries/lists";
import { ListsEditor } from "./lists-editor";

export const metadata: Metadata = { title: "Settings" };

export default async function ListsPage() {
  const lists = await getLists();
  return (
    <ListsEditor
      niches={lists.niches}
      channels={lists.channels}
      sources={lists.sources}
      lostReasons={lists.lostReasons}
    />
  );
}
