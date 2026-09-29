"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { localDateTimeToUtc, MAX_BACKDATE_DAYS } from "@/lib/dates";
import { contactName } from "@/lib/format";
import { OPEN_STAGE_KEYS, type LeadStatus } from "@/lib/domain";
import {
  BD_EDIT_WINDOW_MS,
  editActivityFields,
  makeLogActivitySchema,
  type EditActivityValues,
  type LogActivityValues,
} from "@/lib/validation/activity";
import { getViewer } from "@/server/auth";
import { googleCalendarEnabled } from "@/server/google/config";
import { syncMeeting } from "@/server/google/sync";
import { dbErrorMessage, fail, ok, parseInput, type ActionResult } from "@/server/result";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function activityRefs(supabase: Supabase) {
  const [types, outcomes] = await Promise.all([
    supabase.from("activity_types").select("id, name, category"),
    supabase.from("outcomes").select("key, allowed_categories"),
  ]);
  return { types: types.data ?? [], outcomes: outcomes.data ?? [] };
}

export type LeadForLog = {
  id: string;
  company_name: string;
  status: LeadStatus;
  next_action: string | null;
  next_action_due: string | null;
  lead_timezone: string | null;
  contacts: { id: string; name: string; is_primary: boolean; email: string | null }[];
  openOpportunities: { id: string; title: string; stage_key: string }[];
  /** The viewer's default meeting reminders (Profile). */
  meetingReminders: number[];
  /** The viewer's Google Calendar: null when the feature is off. */
  calendar: "not_connected" | "active" | "needs_reconnect" | null;
};

/** What the Log activity panel needs about a lead. */
export async function getLeadForLog(leadId: string): Promise<ActionResult<LeadForLog>> {
  if (!z.uuid().safeParse(leadId).success) return fail("That lead wasn't found.");
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id, company_name, status, next_action, next_action_due, lead_timezone, contacts(id, first_name, last_name, is_primary, email, created_at), opportunities(id, title, stage_key)",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return fail("That lead wasn't found.");
  const viewer = await getViewer();
  const [{ data: me }, { data: conn }] = await Promise.all([
    supabase
      .from("profiles")
      .select("meeting_reminders")
      .eq("id", viewer?.id ?? "")
      .maybeSingle(),
    googleCalendarEnabled()
      ? supabase.from("google_connections").select("status, auto_add").maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const contacts = [...lead.contacts]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.created_at.localeCompare(b.created_at))
    .map((c) => ({ id: c.id, name: contactName(c), is_primary: c.is_primary, email: c.email }));
  return ok({
    id: lead.id,
    company_name: lead.company_name,
    status: lead.status,
    next_action: lead.next_action,
    next_action_due: lead.next_action_due,
    lead_timezone: lead.lead_timezone,
    contacts,
    openOpportunities: lead.opportunities
      .filter((o) => (OPEN_STAGE_KEYS as string[]).includes(o.stage_key))
      .map((o) => ({ id: o.id, title: o.title, stage_key: o.stage_key })),
    meetingReminders: me?.meeting_reminders ?? [30, 10],
    calendar: !googleCalendarEnabled()
      ? null
      : !conn
        ? "not_connected"
        : conn.status === "active"
          ? "active"
          : "needs_reconnect",
  });
}

export type LogActivityResult = {
  activityId: string;
  /** Set when a meeting was booked. */
  meetingId: string | null;
  /** Meeting booked on a lead without an open opportunity: offer "Create opportunity?" */
  offerOpportunity: boolean;
  /** Proposal sent on a lead with exactly one open opportunity not yet at Proposal sent */
  offerProposalMove: { id: string; title: string } | null;
};

/** Log an activity through the log_activity RPC (activity + next action in one transaction). */
export async function logActivity(input: LogActivityValues): Promise<ActionResult<LogActivityResult>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Your session has ended. Sign in again.");
  const supabase = await createClient();
  const refs = await activityRefs(supabase);
  const parsed = parseInput(makeLogActivitySchema({ ...refs, timezone: viewer.timezone }), input);
  if (!parsed.ok) return parsed;
  const d = parsed.data;

  let activityId: string | null = null;
  let meetingId: string | null = null;
  if (d.meeting) {
    const m = d.meeting;
    const { data, error } = await supabase.rpc("book_meeting", {
      p_lead_id: d.leadId,
      p_activity_type_id: d.activityTypeId,
      p_starts_at: m.startsAtUtc,
      p_timezone: m.timezone,
      p_duration_min: m.durationMin,
      p_location: m.location ?? undefined,
      p_agenda: m.agenda ?? undefined,
      p_reminder_minutes: m.reminders,
      p_invite_contact: m.inviteContact,
      p_add_to_calendar: m.addToCalendar,
      p_occurred_at: d.occurredAtUtc,
      p_contact_id: d.contactId ?? undefined,
      p_opportunity_id: d.opportunityId ?? undefined,
      p_notes: d.notes ?? undefined,
    });
    if (error || !data) return fail(dbErrorMessage(error, "The meeting wasn't booked. Try again."));
    meetingId = data;
    const { data: act } = await supabase.from("meetings").select("activity_id").eq("id", data).maybeSingle();
    activityId = act?.activity_id ?? null;
    // Add it to Google Calendar now if we can; otherwise it retries on the next page load.
    await Promise.race([syncMeeting(data), new Promise((r) => setTimeout(r, 5000))]);
  } else {
    const { data, error } = await supabase.rpc("log_activity", {
      p_lead_id: d.leadId,
      p_activity_type_id: d.activityTypeId,
      p_outcome_key: d.outcomeKey,
      p_occurred_at: d.occurredAtUtc,
      p_contact_id: d.contactId ?? undefined,
      p_opportunity_id: d.opportunityId ?? undefined,
      p_notes: d.notes ?? undefined,
      p_next_action: d.nextAction ?? undefined,
      p_next_action_due: d.nextActionDue ?? undefined,
      p_clear_next_action: d.clearNextAction,
    });
    if (error || !data) return fail(dbErrorMessage(error, "The activity wasn't logged. Try again."));
    activityId = data;
  }

  const { data: opps } = await supabase.from("opportunities").select("id, title, stage_key").eq("lead_id", d.leadId);
  const open = (opps ?? []).filter((o) => (OPEN_STAGE_KEYS as string[]).includes(o.stage_key));
  const category = refs.types.find((t) => t.id === d.activityTypeId)?.category;
  const onlyOpen = open.length === 1 ? open[0]! : null;

  revalidatePath(`/leads/${d.leadId}`);
  revalidatePath("/leads");
  revalidatePath("/my-day");
  return ok({
    activityId: activityId ?? "",
    meetingId,
    offerOpportunity: d.outcomeKey === "meeting_booked" && open.length === 0,
    offerProposalMove:
      category === "proposal" && onlyOpen && ["qualified", "meeting_done"].includes(onlyOpen.stage_key)
        ? { id: onlyOpen.id, title: onlyOpen.title }
        : null,
  });
}

/** Edit notes, outcome and time. BDs: own activities within 24 hours (App rule); the founder any time. */
export async function updateActivity(input: EditActivityValues): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail("Your session has ended. Sign in again.");
  const parsed = parseInput(editActivityFields, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data: act } = await supabase
    .from("activities")
    .select("id, lead_id, user_id, created_at, category")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!act) return fail("That activity wasn't found.");
  if (viewer.role !== "founder") {
    if (act.user_id !== viewer.id) return fail("You can only edit activities you logged.");
    if (Date.now() - new Date(act.created_at).getTime() > BD_EDIT_WINDOW_MS) {
      return fail("Activities lock 24 hours after they're logged. Ask the founder to change it.");
    }
  }
  const { data: outcome } = await supabase
    .from("outcomes")
    .select("allowed_categories")
    .eq("key", parsed.data.outcomeKey)
    .maybeSingle();
  if (!outcome || !outcome.allowed_categories.includes(act.category)) {
    return fail("Pick one of the outcomes offered for this type.", {
      outcomeKey: "Pick one of the outcomes offered for this type.",
    });
  }
  const at = localDateTimeToUtc(parsed.data.occurredAt, viewer.timezone);
  if (!at) return fail("Pick a date and time.", { occurredAt: "Pick a date and time." });
  if (at.getTime() > Date.now() + 5 * 60_000)
    return fail("It can't be in the future.", { occurredAt: "It can't be in the future." });
  if (Date.now() - at.getTime() > MAX_BACKDATE_DAYS * 86_400_000) {
    return fail(`You can backdate up to ${MAX_BACKDATE_DAYS} days.`, {
      occurredAt: `You can backdate up to ${MAX_BACKDATE_DAYS} days.`,
    });
  }
  const { data, error } = await supabase
    .from("activities")
    .update({ outcome_key: parsed.data.outcomeKey, occurred_at: at.toISOString(), notes: parsed.data.notes || null })
    .eq("id", act.id)
    .select("id");
  if (error) return fail(dbErrorMessage(error, "The activity wasn't saved. Try again."));
  if (!data.length) return fail("You can only edit activities you logged.");
  revalidatePath(`/leads/${act.lead_id}`);
  return ok();
}

/** Only the founder can delete activities (the database enforces it). */
export async function deleteActivity(input: { id: string }): Promise<ActionResult> {
  if (!z.uuid().safeParse(input.id).success) return fail("That activity wasn't found.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("activities").delete().eq("id", input.id).select("lead_id");
  if (error) return fail(dbErrorMessage(error, "The activity wasn't deleted. Try again."));
  if (!data.length) return fail("Only the founder can delete activities.");
  revalidatePath(`/leads/${data[0]!.lead_id}`);
  revalidatePath("/my-day");
  return ok();
}
