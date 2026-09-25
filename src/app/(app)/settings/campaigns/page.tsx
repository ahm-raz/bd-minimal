import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getLists } from "@/server/queries/lists";
import { CampaignsEditor } from "./campaigns-editor";

export const metadata: Metadata = { title: "Settings" };

export default async function CampaignsPage() {
  const lists = await getLists();
  const supabase = await createClient();
  const counts = await Promise.all(
    lists.campaigns.map(async (c) => {
      const { count } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("campaign_id", c.id);
      return [c.id, count ?? 0] as const;
    }),
  );
  return (
    <CampaignsEditor
      campaigns={lists.campaigns}
      leadCounts={Object.fromEntries(counts)}
      niches={lists.niches}
      channels={lists.channels}
      members={lists.salesMembers}
    />
  );
}
