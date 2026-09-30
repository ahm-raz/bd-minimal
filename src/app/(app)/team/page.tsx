import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CLOSED_LEAD_STATUSES } from "@/lib/domain";
import { requireFounder, requireViewer } from "@/server/auth";
import { emailInvitesEnabled } from "@/server/email";
import { googleCalendarEnabled } from "@/server/google/config";
import { getMemberLastSignIns } from "@/server/actions/team";
import { getLists } from "@/server/queries/lists";
import { getDepartment } from "@/server/department";
import { inDepartment } from "@/lib/department";
import { TeamView, type TeamRow } from "./team-view";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const viewer = await requireViewer();
  if (!(await requireFounder())) notFound();

  const supabase = await createClient();
  const [lists, department] = await Promise.all([getLists(), getDepartment(viewer)]);

  // Invited = the auth user has never signed in (docs/03, Invite a BD, step 6).
  // Read through a founder-checked server action (the only place the admin client is used).
  const signIns = await getMemberLastSignIns();
  const lastSignIn = new Map(Object.entries(signIns.ok ? signIns.data : {}));

  // Google Calendar status per member (no tokens), docs/10 section 4.
  const calendarOn = googleCalendarEnabled();
  const { data: calendars } = calendarOn ? await supabase.rpc("team_calendar_status") : { data: null };
  const calendarOf = new Map((calendars ?? []).map((c) => [c.user_id, c.status]));

  const rows: TeamRow[] = await Promise.all(
    // The founder's department view shows that department's people (and the founder).
    lists.members.filter((m) => inDepartment(m.role, department)).map(async (m) => {
      const [{ count }, { data: last }] = await Promise.all([
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", m.id)
          .not("status", "in", `(${CLOSED_LEAD_STATUSES.join(",")})`),
        m.role === "social"
          ? supabase
              .from("post_status_events")
              .select("occurred_at:changed_at")
              .eq("changed_by", m.id)
              .order("changed_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : supabase
              .from("activities")
              .select("occurred_at")
              .eq("user_id", m.id)
              .order("occurred_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
      ]);
      const status: TeamRow["status"] = !m.is_active ? "deactivated" : lastSignIn.get(m.id) ? "active" : "invited";
      const calendar: TeamRow["calendar"] =
        !calendarOn || m.role === "social" ? null : (calendarOf.get(m.id) ?? "not_connected");
      return { ...m, status, openLeads: count ?? 0, lastActive: last?.occurred_at ?? null, calendar };
    }),
  );

  return <TeamView rows={rows} niches={lists.niches} emailInvites={emailInvitesEnabled()} />;
}
