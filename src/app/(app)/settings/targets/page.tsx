import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getLists } from "@/server/queries/lists";
import { TargetsGrid } from "./targets-grid";

export const metadata: Metadata = { title: "Settings" };

export default async function TargetsPage({ searchParams }: PageProps<"/settings/targets">) {
  const sp = await searchParams;
  const lists = await getLists();
  const supabase = await createClient();
  const { data: targets } = await supabase.from("targets").select("user_id, metric, weekly_value");
  return (
    <TargetsGrid
      members={lists.members.filter((m) => m.is_active)}
      targets={targets ?? []}
      highlight={typeof sp.person === "string" ? sp.person : null}
    />
  );
}
