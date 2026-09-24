"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { OPEN_STAGE_KEYS } from "@/lib/domain";
import {
  createOpportunitySchema,
  editOpportunitySchema,
  lostSchema,
  moveStageSchema,
  wonSchema,
  type CreateOpportunityValues,
  type EditOpportunityValues,
  type LostValues,
  type WonValues,
} from "@/lib/validation/opportunity";
import { getViewer } from "@/server/auth";
import { dbErrorMessage, fail, ok, parseInput, type ActionResult } from "@/server/result";

function revalidateOpp(leadId?: string) {
  revalidatePath("/pipeline");
  revalidatePath("/leads");
  revalidatePath("/my-day");
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

/** Create an opportunity on a lead. Its owner is always the lead's owner (DB policy). */
export async function createOpportunity(input: CreateOpportunityValues): Promise<ActionResult<{ id: string }>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Your session has ended. Sign in again.");
  const parsed = parseInput(createOpportunitySchema, input);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("id, owner_id").eq("id", d.leadId).maybeSingle();
  if (!lead) return fail("That lead wasn't found.");

  // Only one open opportunity with the same title per lead (App rule, docs/04 section 4).
  const { data: same } = await supabase
    .from("opportunities")
    .select("id")
    .eq("lead_id", lead.id)
    .ilike("title", d.title.replace(/[%_\\]/g, (m) => `\\${m}`))
    .in("stage_key", OPEN_STAGE_KEYS);
  if (same?.length) {
    return fail("This lead already has an open opportunity with that title.", { title: "An open opportunity already has this title." });
  }

  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      lead_id: lead.id,
      owner_id: lead.owner_id,
      created_by: viewer.id,
      title: d.title,
      estimated_value: d.estimatedValue,
      expected_close_date: d.expectedCloseDate,
      notes: d.notes || null,
    })
    .select("id")
    .single();
  if (error) return fail(dbErrorMessage(error, "The opportunity wasn't created. Try again."));
  revalidateOpp(lead.id);
  return ok({ id: data.id });
}

export async function updateOpportunity(input: EditOpportunityValues): Promise<ActionResult> {
  const parsed = parseInput(editOpportunitySchema, input);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({
      title: d.title,
      estimated_value: d.estimatedValue,
      expected_close_date: d.expectedCloseDate,
      notes: d.notes || null,
      contract_ended_at: d.contractEndedAt,
    })
    .eq("id", d.id)
    .select("lead_id");
  if (error) return fail(dbErrorMessage(error, "The opportunity wasn't saved. Try again."));
  if (!data.length) return fail("That opportunity wasn't found.");
  revalidateOpp(data[0]!.lead_id);
  return ok();
}

/** Move to an open stage (any direction). Won and Lost need their dialogs. */
export async function moveOpportunityStage(input: { id: string; stage: string }): Promise<ActionResult> {
  const parsed = parseInput(moveStageSchema, input);
  if (!parsed.ok) return parsed;
  if (!(OPEN_STAGE_KEYS as string[]).includes(parsed.data.stage)) {
    return fail("Use the Won or Lost dialog for that stage.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({ stage_key: parsed.data.stage })
    .eq("id", parsed.data.id)
    .select("lead_id");
  if (error) return fail(dbErrorMessage(error, "The stage wasn't changed. Try again."));
  if (!data.length) return fail("That opportunity wasn't found.");
  revalidateOpp(data[0]!.lead_id);
  return ok();
}

export async function markWon(input: WonValues): Promise<ActionResult> {
  const parsed = parseInput(wonSchema, input);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({ stage_key: "won", won_value: d.wonValue, contract_type: d.contractType, monthly_amount: d.monthlyAmount })
    .eq("id", d.id)
    .select("lead_id");
  if (error) return fail(dbErrorMessage(error, "It wasn't marked as won. Try again."));
  if (!data.length) return fail("That opportunity wasn't found.");
  revalidateOpp(data[0]!.lead_id);
  return ok();
}

export async function markLost(input: LostValues): Promise<ActionResult> {
  const parsed = parseInput(lostSchema, input);
  if (!parsed.ok) return parsed;
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({ stage_key: "lost", lost_reason_id: d.lostReasonId, lost_note: d.lostNote || null })
    .eq("id", d.id)
    .select("lead_id");
  if (error) return fail(dbErrorMessage(error, "It wasn't marked as lost. Try again."));
  if (!data.length) return fail("That opportunity wasn't found.");
  revalidateOpp(data[0]!.lead_id);
  return ok();
}

/** Founder only (DB): delete an opportunity. BDs move it to Lost instead. */
export async function deleteOpportunity(input: { id: string }): Promise<ActionResult> {
  if (!z.uuid().safeParse(input.id).success) return fail("That opportunity wasn't found.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("opportunities").delete().eq("id", input.id).select("lead_id");
  if (error) return fail(dbErrorMessage(error, "The opportunity wasn't deleted. Try again."));
  if (!data.length) return fail("You can't delete opportunities. Move it to Lost instead.");
  revalidateOpp(data[0]!.lead_id);
  return ok();
}
