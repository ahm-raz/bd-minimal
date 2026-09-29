import "server-only";
import { createClient } from "@/lib/supabase/server";
import { contactName } from "@/lib/format";

export type UpcomingMeeting = {
  id: string;
  leadId: string;
  company: string;
  title: string;
  startsAt: string;
  timezone: string;
  durationMin: number;
  location: string | null;
  ownerId: string;
  contact: string | null;
  contactId: string | null;
  reminders: number[];
};

/**
 * Scheduled meetings from the start of today (viewer's clock, minus the meeting length) to `days` ahead.
 * RLS decides whose: a BD gets their own, the founder the whole team's (docs/10 section 4).
 */
export async function getUpcomingMeetings(days = 7): Promise<UpcomingMeeting[]> {
  const supabase = await createClient();
  const from = new Date(Date.now() - 8 * 3600_000).toISOString();
  const to = new Date(Date.now() + days * 86_400_000).toISOString();
  const { data } = await supabase
    .from("meetings")
    .select(
      "id, lead_id, title, starts_at, timezone, duration_min, location, owner_id, contact_id, reminder_minutes, leads(company_name), contacts(first_name, last_name)",
    )
    .eq("status", "scheduled")
    .gte("starts_at", from)
    .lte("starts_at", to)
    .order("starts_at")
    .limit(100);
  return (data ?? [])
    .filter((m) => new Date(m.starts_at).getTime() + m.duration_min * 60_000 > Date.now())
    .map((m) => ({
      id: m.id,
      leadId: m.lead_id,
      company: m.leads?.company_name ?? "",
      title: m.title,
      startsAt: m.starts_at,
      timezone: m.timezone,
      durationMin: m.duration_min,
      location: m.location,
      ownerId: m.owner_id,
      contact: m.contacts ? contactName(m.contacts) : null,
      contactId: m.contact_id,
      reminders: m.reminder_minutes,
    }));
}
