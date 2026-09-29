import "server-only";
import { createClient } from "@/lib/supabase/server";
import { googleCalendarEnabled } from "@/server/google/config";
import type { CalendarStatus } from "@/components/meetings/meeting-fields";

/** The viewer's Google Calendar connection: null when the feature is off (docs/10 section 2). */
export async function getMyCalendarStatus(): Promise<CalendarStatus> {
  if (!googleCalendarEnabled()) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("google_connections").select("status").maybeSingle();
  if (!data) return "not_connected";
  return data.status === "active" ? "active" : "needs_reconnect";
}
