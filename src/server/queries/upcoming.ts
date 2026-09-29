import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CLOSED_LEAD_STATUSES, OPEN_STAGE_KEYS } from "@/lib/domain";
import { addDays, formatDualZone, localDateOf, todayIn } from "@/lib/dates";
import { contactName } from "@/lib/format";
import { meetingLink } from "@/lib/validation/meeting";
import type { UpcomingItem } from "@/lib/notifications";
import type { Viewer } from "@/server/auth";
import { getUpcomingMeetings } from "./meetings";
import { getMyTasks } from "./tasks";
import { getNeedsReview, getSocialDay, refreshPosts } from "./content";

const STUCK_DAYS = 14;

/**
 * "What's upcoming" for the viewer (docs/10 section 3). Computed on request from the same data as
 * My Day, Tasks, Pipeline and Content, so it always matches them. RLS limits every query.
 */
export async function loadUpcoming(viewer: Viewer): Promise<UpcomingItem[]> {
  const supabase = await createClient();
  const today = todayIn(viewer.timezone);
  const weekEnd = addDays(today, 7);
  const items: UpcomingItem[] = [];

  const [tasks, meetings] = await Promise.all([
    getMyTasks(viewer),
    viewer.role === "social" ? [] : getUpcomingMeetings(7),
  ]);

  for (const m of meetings) {
    const mine = m.ownerId === viewer.id;
    // The founder sees the team's meetings for today only; their own for the week.
    if (!mine && localDateOf(new Date(m.startsAt), viewer.timezone) !== today) continue;
    items.push({
      key: `meeting:${m.id}`,
      kind: "meeting",
      title: m.contact ? `Meeting with ${m.contact} · ${m.company}` : `Meeting · ${m.company}`,
      detail: formatDualZone(m.startsAt, m.timezone, viewer.timezone),
      link: `/leads/${m.leadId}`,
      at: m.startsAt,
      date: null,
      timezone: m.timezone,
      joinUrl: meetingLink(m.location),
      reminders: mine ? m.reminders : [],
    });
  }

  for (const t of tasks.tasks) {
    if (t.status === "done" || t.dueDate > weekEnd) continue;
    items.push({
      key: `task:${t.id}`,
      kind: "task",
      title: t.title,
      detail: t.leadName ?? (t.targetCount ? `${t.progress ?? 0} of ${t.targetCount}` : null),
      link: t.leadId ? `/leads/${t.leadId}` : "/tasks",
      at: null,
      date: t.dueDate,
    });
  }

  if (viewer.role !== "social") {
    const [followUps, deals] = await Promise.all([
      supabase
        .from("leads")
        .select("id, company_name, next_action, next_action_due, contacts(first_name, last_name, is_primary)")
        .eq("owner_id", viewer.id)
        .not("status", "in", `(${CLOSED_LEAD_STATUSES.join(",")})`)
        .not("next_action_due", "is", null)
        .lte("next_action_due", weekEnd)
        .order("next_action_due")
        .limit(100),
      supabase
        .from("opportunities")
        .select("id, lead_id, title, expected_close_date, stage_changed_at, leads(company_name)")
        .eq("owner_id", viewer.id)
        .in("stage_key", OPEN_STAGE_KEYS)
        .limit(200),
    ]);
    for (const l of followUps.data ?? []) {
      // A booked meeting already shows as a meeting; don't list its "Meeting with …" follow-up twice.
      if (
        l.next_action?.startsWith("Meeting with ") &&
        items.some((i) => i.kind === "meeting" && i.link === `/leads/${l.id}`)
      )
        continue;
      const primary = l.contacts.find((c) => c.is_primary) ?? l.contacts[0];
      items.push({
        key: `follow:${l.id}`,
        kind: "follow_up",
        title: l.next_action ?? "Follow up",
        detail: primary ? `${contactName(primary)} · ${l.company_name}` : l.company_name,
        link: `/leads/${l.id}`,
        at: null,
        date: l.next_action_due,
      });
    }
    const stuckBefore = Date.now() - STUCK_DAYS * 86_400_000;
    for (const o of deals.data ?? []) {
      const company = o.leads?.company_name ?? "";
      if (o.expected_close_date && o.expected_close_date <= weekEnd) {
        items.push({
          key: `close:${o.id}`,
          kind: "deal_close",
          title: `${o.title} is expected to close`,
          detail: company,
          link: `/leads/${o.lead_id}`,
          at: null,
          date: o.expected_close_date,
        });
      } else if (new Date(o.stage_changed_at).getTime() < stuckBefore) {
        items.push({
          key: `stuck:${o.id}`,
          kind: "deal_stuck",
          title: `${o.title} has been in the same stage for ${STUCK_DAYS}+ days`,
          detail: company,
          link: `/leads/${o.lead_id}`,
          at: null,
          date: addDays(localDateOf(new Date(o.stage_changed_at), viewer.timezone), STUCK_DAYS),
        });
      }
    }
  }

  if (viewer.role === "social") {
    const day = await getSocialDay(viewer);
    for (const p of day.todayPosts) {
      if (!p.scheduledAt || ["posted", "cancelled"].includes(p.status)) continue;
      items.push({
        key: `post:${p.id}`,
        kind: "post",
        title: p.title,
        detail: "Scheduled post",
        link: `/content?post=${p.id}`,
        at: p.scheduledAt,
        date: null,
      });
    }
    for (const p of day.draftsDue) {
      if (!p.draftDueAt) continue;
      items.push({
        key: `draft:${p.id}`,
        kind: "draft",
        title: p.title,
        detail: "Draft due",
        link: `/content?post=${p.id}`,
        at: p.draftDueAt,
        date: null,
      });
    }
    for (const p of day.changesRequested) {
      items.push({
        key: `changes:${p.id}`,
        kind: "changes",
        title: p.title,
        detail: "Changes requested",
        link: `/content?post=${p.id}`,
        at: null,
        date: today,
      });
    }
  }

  if (viewer.role === "founder") {
    await refreshPosts(viewer);
    for (const p of await getNeedsReview()) {
      items.push({
        key: `review:${p.id}`,
        kind: "review",
        title: p.title,
        detail: "Waiting for your review",
        link: `/content?post=${p.id}`,
        at: null,
        date: today,
      });
    }
  }
  return items;
}
