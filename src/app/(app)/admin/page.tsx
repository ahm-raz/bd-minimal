import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin, requireViewer } from "@/server/auth";
import { emailInvitesEnabled } from "@/server/email";
import { OfficesView } from "./offices-view";

export const metadata: Metadata = { title: "Offices" };

/** Platform admins only: the office list, create, edit, suspend (docs/11 section 6). Everyone else gets 404. */
export default async function AdminPage() {
  await requireViewer();
  const admin = await requirePlatformAdmin();
  if (!admin) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_office_summary");
  if (error) throw new Error("The office list couldn't be loaded.");
  return <OfficesView offices={data ?? []} myOfficeId={admin.officeId} emailInvites={emailInvitesEnabled()} />;
}
