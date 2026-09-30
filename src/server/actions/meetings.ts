"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  cancelMeetingSchema,
  makeEditMeetingSchema,
  type CancelMeetingValues,
  type EditMeetingValues,
} from "@/lib/validation/meeting";
import { firstName } from "@/lib/format";
import { getViewer } from "@/server/auth";
import { syncMeeting } from "@/server/google/sync";
import { dbErrorMessage, fail, ok, parseInput, type ActionResult } from "@/server/result";

/** Meeting changes from the lead page (docs/10 section 4). RLS decides who may change what. */

const SESSION_ENDED = "Your session has ended. Sign in again.";

async function afterChange(leadId: string, meetingId: string) {
  // Give Google a moment; the meeting is saved either way and retries on the next page load.
  await Promise.race([syncMeeting(meetingId), new Promise((r) => setTimeout(r, 5000))]);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/my-day");
}

export async function rescheduleMeeting(input: EditMeetingValues): Promise<ActionResult> {
  if (!(await getViewer())) return fail(SESSION_ENDED);
  const parsed = parseInput(makeEditMeetingSchema(), input);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meetings")
    .update({
      starts_at: d.startsAtUtc,
      timezone: d.timezone,
      duration_min: d.durationMin,
      location: d.location,
      agenda: d.agenda,
      reminder_minutes: d.reminders,
      add_to_calendar: d.addToCalendar,
      invite_contact: d.inviteContact,
    })
    .eq("id", d.id)
    .select("lead_id")
    .maybeSingle();
  if (error || !data) return fail(dbErrorMessage(error, "The meeting wasn't saved. Try again."));
  await afterChange(data.lead_id, d.id);
  return ok();
}

export async function cancelMeeting(input: CancelMeetingValues): Promise<ActionResult> {
  if (!(await getViewer())) return fail(SESSION_ENDED);
  const parsed = parseInput(cancelMeetingSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meetings")
    .update({ status: "cancelled", status_note: parsed.data.reason })
    .eq("id", parsed.data.id)
    .select("lead_id")
    .maybeSingle();
  if (error || !data) return fail(dbErrorMessage(error, "The meeting wasn't cancelled. Try again."));
  await afterChange(data.lead_id, parsed.data.id);
  return ok();
}

const statusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["held", "no_show", "scheduled"]),
  heldActivityId: z.uuid().nullable().optional(),
});

/** Held, no-show, or Undo (back to scheduled). */
export async function setMeetingStatus(input: z.input<typeof statusSchema>): Promise<ActionResult> {
  if (!(await getViewer())) return fail(SESSION_ENDED);
  const parsed = parseInput(statusSchema, input);
  if (!parsed.ok) return parsed;
  const { id, status, heldActivityId } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meetings")
    .update({ status, ...(status === "held" && heldActivityId ? { held_activity_id: heldActivityId } : {}) })
    .eq("id", id)
    .select("lead_id")
    .maybeSingle();
  if (error || !data) return fail(dbErrorMessage(error, "The meeting wasn't updated. Try again."));
  await afterChange(data.lead_id, id);
  return ok();
}

/** Retry now, or add it again after it was removed in Google. */
export async function retryMeetingSync(input: { id: string }): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail(SESSION_ENDED);
  const parsed = parseInput(z.object({ id: z.uuid() }), input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data: m } = await supabase
    .from("meetings")
    .select("lead_id, owner_id, gcal_state")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!m) return fail("That meeting wasn't found.");
  // Sync runs with the owner's own Google token (docs/10 section 2), so only the owner can retry.
  if (m.owner_id !== viewer.id) {
    const { data: owner } = await supabase.from("profiles").select("full_name").eq("id", m.owner_id).maybeSingle();
    const name = firstName(owner?.full_name) || "The owner";
    return fail(
      m.gcal_state === "pending"
        ? `This syncs when ${name} next opens the app.`
        : `Only ${name} can retry this. It uses their own Google Calendar.`,
    );
  }
  const { error } = await supabase
    .from("meetings")
    .update({
      gcal_state: "pending",
      gcal_attempts: 0,
      gcal_next_retry_at: null,
      gcal_error: null,
      // "Add again": forget the deleted event so a fresh one is made.
      ...(m.gcal_state === "removed_in_google" ? { gcal_event_id: null, gcal_calendar_id: null } : {}),
    })
    .eq("id", parsed.data.id);
  if (error) return fail(dbErrorMessage(error, "Couldn't retry. Try again."));
  await syncMeeting(parsed.data.id);
  const { data: after } = await supabase
    .from("meetings")
    .select("gcal_state, gcal_error")
    .eq("id", parsed.data.id)
    .maybeSingle();
  revalidatePath(`/leads/${m.lead_id}`);
  if (after?.gcal_state !== "synced")
    return fail(after?.gcal_error ?? "Google Calendar didn't answer. It will try again later.");
  return ok();
}
