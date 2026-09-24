import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CLOSED_LEAD_STATUSES, type TargetMetric } from "@/lib/domain";
import { addDays, rangeFor, todayIn } from "@/lib/dates";
import { contactName } from "@/lib/format";
import type { Viewer } from "@/server/auth";

export type FollowUp = {
  leadId: string;
  company: string;
  contact: string | null;
  contactId: string | null;
  nextAction: string | null;
  due: string;
};

export type Scoreboard = {
  leads_added: number;
  outreach: number;
  follow_ups: number;
  replies: number;
  positive_replies: number;
  meetings_booked: number;
  meetings_done: number;
  proposals_sent: number;
};

export type MyDayData = {
  today: string;
  range: { fromUtc: string; toUtc: string };
  counts: Scoreboard;
  targets: Partial<Record<TargetMetric, number>>;
  followUps: FollowUp[];
  comingUp: FollowUp[];
};

const EMPTY: Scoreboard = {
  leads_added: 0,
  outreach: 0,
  follow_ups: 0,
  replies: 0,
  positive_replies: 0,
  meetings_booked: 0,
  meetings_done: 0,
  proposals_sent: 0,
};

/** My Day (docs/07 section 2). Counters come from metrics_scoreboard for today, filtered to self. */
export async function getMyDay(viewer: Viewer): Promise<MyDayData> {
  const supabase = await createClient();
  const today = todayIn(viewer.timezone);
  const range = rangeFor("today", viewer.timezone);

  const [scoreboard, targets, leads] = await Promise.all([
    supabase.rpc("metrics_scoreboard", { p_from: range.fromUtc, p_to: range.toUtc }),
    supabase.from("targets").select("metric, weekly_value").eq("user_id", viewer.id),
    supabase
      .from("leads")
      .select("id, company_name, next_action, next_action_due, contacts(id, first_name, last_name, is_primary, created_at)")
      .eq("owner_id", viewer.id)
      .not("status", "in", `(${CLOSED_LEAD_STATUSES.join(",")})`)
      .not("next_action_due", "is", null)
      .lte("next_action_due", addDays(today, 7))
      .order("next_action_due", { ascending: true })
      .limit(500),
  ]);

  const mine = (scoreboard.data ?? []).find((r) => r.user_id === viewer.id);
  const counts: Scoreboard = mine
    ? {
        leads_added: mine.leads_added,
        outreach: mine.outreach,
        follow_ups: mine.follow_ups,
        replies: mine.replies,
        positive_replies: mine.positive_replies,
        meetings_booked: mine.meetings_booked,
        meetings_done: mine.meetings_done,
        proposals_sent: mine.proposals_sent,
      }
    : EMPTY;

  const rows: FollowUp[] = (leads.data ?? []).map((l) => {
    const c = [...l.contacts].sort(
      (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.created_at.localeCompare(b.created_at),
    )[0];
    return {
      leadId: l.id,
      company: l.company_name,
      contact: c ? contactName(c) : null,
      contactId: c?.id ?? null,
      nextAction: l.next_action,
      due: l.next_action_due!,
    };
  });

  return {
    today,
    range: { fromUtc: range.fromUtc, toUtc: range.toUtc },
    counts,
    targets: Object.fromEntries((targets.data ?? []).map((t) => [t.metric, t.weekly_value])),
    // overdue first (oldest first), then today
    followUps: rows.filter((r) => r.due <= today),
    comingUp: rows.filter((r) => r.due > today),
  };
}
