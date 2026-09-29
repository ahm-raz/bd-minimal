import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLOSED_LEAD_STATUSES } from "@/lib/domain";
import { requireFounder, requireViewer } from "@/server/auth";
import { emailInvitesEnabled } from "@/server/email";
import { getLists } from "@/server/queries/lists";
import { TeamView, type TeamRow } from "./team-view";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  await requireViewer();
  if (!(await requireFounder())) notFound();

  const supabase = await createClient();
  const lists = await getLists();

  // Invited = the auth user has never signed in (docs/03, Invite a BD, step 6).
  // Reading sign-in status needs the Auth admin API; the caller is a verified founder.
  const { data: authUsers } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
  const lastSignIn = new Map((authUsers?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));

  const rows: TeamRow[] = await Promise.all(
    lists.members.map(async (m) => {
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
      return { ...m, status, openLeads: count ?? 0, lastActive: last?.occurred_at ?? null };
    }),
  );

  return <TeamView rows={rows} niches={lists.niches} emailInvites={emailInvitesEnabled()} />;
}
