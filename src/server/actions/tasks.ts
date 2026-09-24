"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isWeekend, todayIn } from "@/lib/dates";
import { CLOSED_LEAD_STATUSES, OPEN_STAGE_KEYS } from "@/lib/domain";
import { flagLeadSchema, taskFormSchema, type FlagLeadValues, type TaskFormValues } from "@/lib/validation/task";
import { FOUNDER_ONLY, getViewer, requireFounder } from "@/server/auth";
import { dbErrorMessage, fail, ok, parseInput, type ActionResult } from "@/server/result";

function revalidateTasks() {
  revalidatePath("/tasks");
  revalidatePath("/my-day");
}

/**
 * Assign task (founder). "Repeat on weekdays" stores a template and creates the first
 * instance through ensure_recurring_tasks when the due date is a weekday.
 */
export async function createTask(input: TaskFormValues): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(taskFormSchema, input);
  if (!parsed.ok) return parsed;
  const founder = await requireFounder();
  if (!founder) return fail(FOUNDER_ONLY);
  const d = parsed.data;
  const supabase = await createClient();

  if (d.repeat) {
    const { data: t, error } = await supabase
      .from("task_templates")
      .insert({
        assignee_id: d.assigneeId,
        created_by: founder.id,
        title: d.title,
        kind: d.kind,
        metric: d.metric,
        target_count: d.targetCount,
        filter_niche_id: d.filterNicheId,
        filter_campaign_id: d.filterCampaignId,
        note: d.note,
        starts_on: d.dueDate,
      })
      .select("id")
      .single();
    if (error) return fail(dbErrorMessage(error, "The repeating task wasn't saved. Try again."));
    if (!isWeekend(d.dueDate)) await supabase.rpc("ensure_recurring_tasks", { p_user: d.assigneeId, p_day: d.dueDate });
    revalidateTasks();
    return ok({ id: t.id });
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      assignee_id: d.assigneeId,
      created_by: founder.id,
      title: d.title,
      kind: d.kind,
      metric: d.metric,
      target_count: d.targetCount,
      filter_niche_id: d.filterNicheId,
      filter_campaign_id: d.filterCampaignId,
      lead_id: d.leadId,
      opportunity_id: d.opportunityId,
      note: d.note,
      due_date: d.dueDate,
    })
    .select("id")
    .single();
  if (error) return fail(dbErrorMessage(error, "The task wasn't assigned. Try again."));
  revalidateTasks();
  return ok({ id: data.id });
}

/** Edit one task (founder). The database rejects BDs changing anything but completion. */
export async function updateTask(input: TaskFormValues): Promise<ActionResult> {
  const parsed = parseInput(taskFormSchema, input);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  if (!d.id) return fail("That task wasn't found.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({
      assignee_id: d.assigneeId,
      title: d.title,
      metric: d.metric,
      target_count: d.targetCount,
      filter_niche_id: d.filterNicheId,
      filter_campaign_id: d.filterCampaignId,
      lead_id: d.leadId,
      opportunity_id: d.opportunityId,
      note: d.note,
      due_date: d.dueDate,
    })
    .eq("id", d.id)
    .select("id");
  if (error) return fail(dbErrorMessage(error, "The task wasn't saved. Try again."));
  if (!data.length) return fail(FOUNDER_ONLY);
  revalidateTasks();
  return ok();
}

/** Edit a repeating task: changes future days only; tasks already created stay as they are. */
export async function updateTemplate(input: TaskFormValues): Promise<ActionResult> {
  const parsed = parseInput(taskFormSchema, input);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  if (!d.templateId) return fail("That repeating task wasn't found.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_templates")
    .update({
      assignee_id: d.assigneeId,
      title: d.title,
      metric: d.metric,
      target_count: d.targetCount,
      filter_niche_id: d.filterNicheId,
      filter_campaign_id: d.filterCampaignId,
      note: d.note,
    })
    .eq("id", d.templateId)
    .select("id");
  if (error) return fail(dbErrorMessage(error, "The repeating task wasn't saved. Try again."));
  if (!data.length) return fail(FOUNDER_ONLY);
  revalidateTasks();
  return ok();
}

export async function stopTemplate(input: { id: string }): Promise<ActionResult> {
  if (!z.uuid().safeParse(input.id).success) return fail("That repeating task wasn't found.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("task_templates").update({ is_active: false }).eq("id", input.id).select("id");
  if (error) return fail(dbErrorMessage(error, "It wasn't stopped. Try again."));
  if (!data.length) return fail(FOUNDER_ONLY);
  revalidateTasks();
  return ok();
}

export async function deleteTask(input: { id: string }): Promise<ActionResult> {
  if (!z.uuid().safeParse(input.id).success) return fail("That task wasn't found.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").delete().eq("id", input.id).select("lead_id");
  if (error) return fail(dbErrorMessage(error, "The task wasn't deleted. Try again."));
  if (!data.length) return fail("Only the founder can delete tasks.");
  revalidateTasks();
  if (data[0]!.lead_id) revalidatePath(`/leads/${data[0]!.lead_id}`);
  return ok();
}

/**
 * Tick or untick a checklist or lead-fix task. Count tasks complete themselves (DB rejects).
 * BDs can untick only on the day they ticked it (App rule, docs/01).
 */
export async function setTaskDone(input: { id: string; done: boolean }): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail("Your session has ended. Sign in again.");
  if (!z.uuid().safeParse(input.id).success) return fail("That task wasn't found.");
  const supabase = await createClient();
  const { data: task } = await supabase.from("tasks").select("id, kind, completed_at, lead_id").eq("id", input.id).maybeSingle();
  if (!task) return fail("That task wasn't found.");
  if (task.kind === "count") return fail("Count tasks complete themselves when the number is reached.");
  if (!input.done && task.completed_at && viewer.role !== "founder") {
    if (todayIn(viewer.timezone, new Date(task.completed_at)) !== todayIn(viewer.timezone)) {
      return fail("You can only untick a task on the day you ticked it.");
    }
  }
  const { data, error } = await supabase
    .from("tasks")
    .update({ completed_at: input.done ? new Date().toISOString() : null })
    .eq("id", input.id)
    .select("id");
  if (error) return fail(dbErrorMessage(error, "The task wasn't updated. Try again."));
  if (!data.length) return fail("That task wasn't found.");
  revalidateTasks();
  if (task.lead_id) revalidatePath(`/leads/${task.lead_id}`);
  return ok();
}

/** Flag lead (founder): a lead-fix task for the lead's owner, due today in their time zone (docs/04 section 7). */
export async function flagLead(input: FlagLeadValues): Promise<ActionResult> {
  const parsed = parseInput(flagLeadSchema, input);
  if (!parsed.ok) return parsed;
  const founder = await requireFounder();
  if (!founder) return fail(FOUNDER_ONLY);
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, owner_id, profiles:owner_id(timezone)")
    .eq("id", parsed.data.leadId)
    .maybeSingle();
  if (!lead) return fail("That lead wasn't found.");
  const ownerTz = (lead.profiles as { timezone: string } | null)?.timezone ?? founder.timezone;
  const note = parsed.data.note;
  const title = `Fix lead: ${note.length > 60 ? `${note.slice(0, 57)}…` : note}`;
  const { error } = await supabase.from("tasks").insert({
    assignee_id: lead.owner_id,
    created_by: founder.id,
    title,
    kind: "lead_fix",
    lead_id: lead.id,
    note,
    due_date: todayIn(ownerTz),
  });
  if (error) return fail(dbErrorMessage(error, "The lead wasn't flagged. Try again."));
  revalidateTasks();
  revalidatePath(`/leads/${lead.id}`);
  revalidatePath("/leads");
  return ok();
}

export type LinkOption = { id: string; label: string; kind: "lead" | "opportunity" };

/** Search leads and opportunities to link to a checklist task (RLS scopes the results). */
export async function searchLinkTargets(input: { q: string; assigneeId?: string | null }): Promise<ActionResult<LinkOption[]>> {
  const q = (input.q ?? "").trim().replace(/[%_\\,()]/g, " ");
  if (q.length < 2) return ok([]);
  const supabase = await createClient();
  let leads = supabase.from("leads").select("id, company_name").ilike("company_name", `%${q}%`).limit(8);
  let opps = supabase.from("opportunities").select("id, title, leads!inner(company_name)").ilike("title", `%${q}%`).limit(8);
  if (input.assigneeId && z.uuid().safeParse(input.assigneeId).success) {
    leads = leads.eq("owner_id", input.assigneeId);
    opps = opps.eq("owner_id", input.assigneeId);
  }
  const [l, o] = await Promise.all([leads, opps]);
  return ok([
    ...(l.data ?? []).map((x) => ({ id: x.id, label: x.company_name, kind: "lead" as const })),
    ...(o.data ?? []).map((x) => ({ id: x.id, label: `${x.title} (${x.leads.company_name})`, kind: "opportunity" as const })),
  ]);
}

export type TaskHelperList = { id: string; label: string; href: string }[];

/** Lists shown under the two list-style common tasks (docs/04 section 6, items 7 and 8). */
export async function taskHelperList(input: { assigneeId: string; kind: "cleanup" | "stuck" }): Promise<ActionResult<TaskHelperList>> {
  if (!z.uuid().safeParse(input.assigneeId).success) return ok([]);
  const supabase = await createClient();
  if (input.kind === "cleanup") {
    const { data } = await supabase
      .from("leads")
      .select("id, company_name")
      .eq("owner_id", input.assigneeId)
      .is("next_action_due", null)
      .not("status", "in", `(${CLOSED_LEAD_STATUSES.join(",")})`)
      .order("created_at")
      .limit(50);
    return ok((data ?? []).map((l) => ({ id: l.id, label: l.company_name, href: `/leads/${l.id}` })));
  }
  const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("opportunities")
    .select("id, title, lead_id, leads!inner(company_name)")
    .eq("owner_id", input.assigneeId)
    .in("stage_key", OPEN_STAGE_KEYS)
    .lt("stage_changed_at", cutoff)
    .limit(50);
  return ok((data ?? []).map((o) => ({ id: o.id, label: `${o.leads.company_name}: ${o.title}`, href: `/leads/${o.lead_id}` })));
}
