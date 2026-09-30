import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays, isWeekend, todayIn } from "@/lib/dates";
import type { TaskKind, TaskMetric } from "@/lib/domain";
import type { Viewer } from "@/server/auth";

export type TaskItem = {
  id: string;
  assigneeId: string;
  createdBy: string;
  title: string;
  kind: TaskKind;
  metric: TaskMetric | null;
  targetCount: number | null;
  progress: number | null;
  dueDate: string;
  leadId: string | null;
  leadName: string | null;
  opportunityId: string | null;
  opportunityTitle: string | null;
  /** Where the task's link goes: its lead, or the linked opportunity's lead. Null when neither can be seen. */
  linkLeadId: string | null;
  note: string | null;
  completedAt: string | null;
  status: "open" | "done" | "overdue";
  onTime: boolean | null;
  isRecurring: boolean;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function withProgress(supabase: Supabase, from: string, to: string, assignee?: string): Promise<TaskItem[]> {
  const { data, error } = await supabase.rpc("tasks_with_progress", {
    p_from: from,
    p_to: to,
    ...(assignee ? { p_assignee: assignee } : {}),
  });
  if (error) throw new Error(`Tasks couldn't be loaded: ${error.message}`);
  const rows = data ?? [];
  const leadIds = [...new Set(rows.flatMap((t) => (t.lead_id ? [t.lead_id] : [])))];
  const oppIds = [...new Set(rows.flatMap((t) => (t.opportunity_id ? [t.opportunity_id] : [])))];
  const [leads, opps] = await Promise.all([
    leadIds.length ? supabase.from("leads").select("id, company_name").in("id", leadIds) : Promise.resolve({ data: [] }),
    oppIds.length ? supabase.from("opportunities").select("id, title, lead_id").in("id", oppIds) : Promise.resolve({ data: [] }),
  ]);
  const leadName = new Map((leads.data ?? []).map((l: { id: string; company_name: string }) => [l.id, l.company_name]));
  const oppById = new Map((opps.data ?? []).map((o: { id: string; title: string; lead_id: string }) => [o.id, o]));
  return rows.map((t) => ({
    id: t.id,
    assigneeId: t.assignee_id,
    createdBy: t.created_by,
    title: t.title,
    kind: t.kind,
    metric: t.metric,
    targetCount: t.target_count,
    progress: t.progress,
    dueDate: t.due_date,
    leadId: t.lead_id,
    leadName: t.lead_id ? (leadName.get(t.lead_id) ?? null) : null,
    opportunityId: t.opportunity_id,
    opportunityTitle: t.opportunity_id ? (oppById.get(t.opportunity_id)?.title ?? null) : null,
    linkLeadId: t.lead_id ?? (t.opportunity_id ? (oppById.get(t.opportunity_id)?.lead_id ?? null) : null),
    note: t.note,
    completedAt: t.completed_at,
    status: t.status as TaskItem["status"],
    onTime: t.completed_on_time,
    isRecurring: t.is_recurring,
  }));
}

/** My Day: create today's repeating tasks, then today's tasks plus overdue ones from earlier (docs/07 section 2). */
export async function getMyDayTasks(viewer: Viewer): Promise<{ today: string; tasks: TaskItem[] }> {
  const supabase = await createClient();
  const today = todayIn(viewer.timezone);
  await supabase.rpc("ensure_recurring_tasks", { p_user: viewer.id, p_day: today });
  const all = await withProgress(supabase, addDays(today, -30), today, viewer.id);
  return { today, tasks: all.filter((t) => t.dueDate === today || t.status === "overdue") };
}

/** BD Tasks view: today, overdue, and the next 7 days. */
export async function getMyTasks(viewer: Viewer): Promise<{ today: string; tasks: TaskItem[] }> {
  const supabase = await createClient();
  const today = todayIn(viewer.timezone);
  await supabase.rpc("ensure_recurring_tasks", { p_user: viewer.id, p_day: today });
  const all = await withProgress(supabase, addDays(today, -60), addDays(today, 7), viewer.id);
  return { today, tasks: all.filter((t) => t.dueDate >= today || t.status === "overdue") };
}

export type TemplateItem = {
  id: string;
  assigneeId: string;
  title: string;
  kind: "count" | "checklist";
  metric: TaskMetric | null;
  targetCount: number | null;
  filterNicheId: string | null;
  filterCampaignId: string | null;
  note: string | null;
  startsOn: string;
  isActive: boolean;
};

/**
 * Founder Tasks page for a date: make sure every active member's repeating tasks exist
 * for that day (weekdays only), then load the day's tasks and anything still overdue.
 */
export async function getTasksForDay(date: string, memberIds: string[]): Promise<{ day: TaskItem[]; overdue: TaskItem[]; templates: TemplateItem[] }> {
  const supabase = await createClient();
  if (!isWeekend(date)) {
    await Promise.all(memberIds.map((id) => supabase.rpc("ensure_recurring_tasks", { p_user: id, p_day: date })));
  }
  const [day, earlier, templates] = await Promise.all([
    withProgress(supabase, date, date),
    withProgress(supabase, addDays(date, -60), addDays(date, -1)),
    supabase.from("task_templates").select("*").order("is_active", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  return {
    day,
    overdue: earlier.filter((t) => t.status === "overdue"),
    templates: (templates.data ?? []).map((t) => ({
      id: t.id,
      assigneeId: t.assignee_id,
      title: t.title,
      kind: t.kind as "count" | "checklist",
      metric: t.metric,
      targetCount: t.target_count,
      filterNicheId: t.filter_niche_id,
      filterCampaignId: t.filter_campaign_id,
      note: t.note,
      startsOn: t.starts_on,
      isActive: t.is_active,
    })),
  };
}
