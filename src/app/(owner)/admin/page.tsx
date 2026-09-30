import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { emailInvitesEnabled } from "@/server/email";
import { OfficesView } from "./offices-view";

export const metadata: Metadata = { title: "Offices" };

/** The owner's office list: create, edit, suspend (docs/11 section 6). The (owner) layout checks the owner. */
export default async function AdminPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_office_summary");
  if (error) throw new Error("The office list couldn't be loaded.");
  return <OfficesView offices={data ?? []} emailInvites={emailInvitesEnabled()} />;
}
