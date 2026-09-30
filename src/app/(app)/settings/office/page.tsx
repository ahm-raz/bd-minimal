import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { OfficeForm } from "./office-form";

export const metadata: Metadata = { title: "Office" };

/** Settings → Office (founder; the settings layout checks): name, default time zone, seats (docs/11 section 6). */
export default async function OfficeSettingsPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const [{ data: office }, { count }] = await Promise.all([
    supabase.from("offices").select("name, timezone, seat_limit").eq("id", viewer.officeId).single(),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);
  if (!office) throw new Error("The office couldn't be loaded.");
  return <OfficeForm name={office.name} timezone={office.timezone} seatLimit={office.seat_limit} activeMembers={count ?? 0} />;
}
