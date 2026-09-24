"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActivityCategory, TargetMetric } from "@/lib/domain";
import {
  activityTypeSchema,
  campaignSchema,
  listItemSchema,
  outcomeLabelSchema,
  renameListItemSchema,
  reorderSchema,
  stageSchema,
  targetSchema,
  toggleListItemSchema,
  type ActivityTypeInput,
  type CampaignInput,
  type ListTable,
  type StageInput,
  type TargetInput,
} from "@/lib/validation/settings";
import { dbErrorMessage, fail, ok, parseInput, type ActionResult } from "@/server/result";

/*
 * Settings writes run with the caller's own session. There is deliberately no role
 * check here: RLS is the security boundary, and a BD's write is rejected by the database
 * (an insert raises, an update matches zero rows). Both come back as a permission error.
 */

const NO_PERMISSION = "You don't have permission to change settings. Ask the founder.";

function done(path = "/settings") {
  revalidatePath(path, "layout");
}

export async function addListItem(input: { table: ListTable; name: string }): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(listItemSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data: last } = await supabase
    .from(parsed.data.table)
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from(parsed.data.table)
    .insert({ name: parsed.data.name, sort_order: (last?.sort_order ?? 0) + 1 })
    .select("id")
    .single();
  if (error) return fail(dbErrorMessage(error, "It wasn't added. Try again."), error.code === "23505" ? { name: "That name is already in the list." } : undefined);
  done();
  return ok({ id: data.id });
}

export async function renameListItem(input: { table: ListTable; id: string; name: string }): Promise<ActionResult> {
  const parsed = parseInput(renameListItemSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(parsed.data.table)
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fail(dbErrorMessage(error, "The name wasn't saved. Try again."));
  if (!data.length) return fail(NO_PERMISSION);
  done();
  return ok();
}

export async function setListItemActive(input: { table: ListTable; id: string; active: boolean }): Promise<ActionResult> {
  const parsed = parseInput(toggleListItemSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(parsed.data.table)
    .update({ is_active: parsed.data.active })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fail(dbErrorMessage(error, "The change wasn't saved. Try again."));
  if (!data.length) return fail(NO_PERMISSION);
  done();
  return ok();
}

export async function reorderList(input: { table: ListTable | "activity_types"; ids: string[] }): Promise<ActionResult> {
  const parsed = parseInput(reorderSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const results = await Promise.all(
    parsed.data.ids.map((id, i) =>
      supabase.from(parsed.data.table).update({ sort_order: i + 1 }).eq("id", id).select("id"),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return fail(dbErrorMessage(failed.error, "The new order wasn't saved. Try again."));
  if (results.some((r) => !r.data?.length)) return fail(NO_PERMISSION);
  done();
  return ok();
}

export async function saveActivityType(input: ActivityTypeInput): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(activityTypeSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const row = {
    name: parsed.data.name,
    category: parsed.data.category as ActivityCategory,
    default_channel_id: parsed.data.defaultChannelId,
    is_active: parsed.data.isActive,
  };
  if (parsed.data.id) {
    const { data, error } = await supabase.from("activity_types").update(row).eq("id", parsed.data.id).select("id");
    if (error) return fail(dbErrorMessage(error, "The activity type wasn't saved. Try again."));
    if (!data.length) return fail(NO_PERMISSION);
    done();
    return ok({ id: parsed.data.id });
  }
  const { data: last } = await supabase
    .from("activity_types")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("activity_types")
    .insert({ ...row, sort_order: (last?.sort_order ?? 0) + 1 })
    .select("id")
    .single();
  if (error) return fail(dbErrorMessage(error, "The activity type wasn't added. Try again."));
  done();
  return ok({ id: data.id });
}

export async function renameOutcome(input: { key: string; label: string }): Promise<ActionResult> {
  const parsed = parseInput(outcomeLabelSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("outcomes")
    .update({ label: parsed.data.label })
    .eq("key", parsed.data.key)
    .select("key");
  if (error) return fail(dbErrorMessage(error, "The label wasn't saved. Try again."));
  if (!data.length) return fail(NO_PERMISSION);
  done();
  return ok();
}

export async function saveStage(input: StageInput): Promise<ActionResult> {
  const parsed = parseInput(stageSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data: stage } = await supabase.from("stages").select("is_open").eq("key", parsed.data.key).maybeSingle();
  // Won and Lost probabilities are fixed (100% and 0%); only their labels change.
  const update = stage?.is_open
    ? { label: parsed.data.label, probability: parsed.data.probability / 100 }
    : { label: parsed.data.label };
  const { data, error } = await supabase.from("stages").update(update).eq("key", parsed.data.key).select("key");
  if (error) return fail(dbErrorMessage(error, "The stage wasn't saved. Try again."));
  if (!data.length) return fail(NO_PERMISSION);
  done();
  revalidatePath("/pipeline");
  return ok();
}

export async function saveCampaign(input: CampaignInput): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(campaignSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const row = {
    name: parsed.data.name,
    niche_id: parsed.data.nicheId,
    channel_id: parsed.data.channelId,
    owner_id: parsed.data.ownerId,
    status: parsed.data.status,
    notes: parsed.data.notes,
  };
  if (parsed.data.id) {
    const { data, error } = await supabase.from("campaigns").update(row).eq("id", parsed.data.id).select("id");
    if (error) {
      return fail(
        dbErrorMessage(error, "The campaign wasn't saved. Try again."),
        error.code === "23505" ? { name: "Another campaign already has this name." } : undefined,
      );
    }
    if (!data.length) return fail(NO_PERMISSION);
    done();
    return ok({ id: parsed.data.id });
  }
  const { data, error } = await supabase.from("campaigns").insert(row).select("id").single();
  if (error) {
    return fail(
      dbErrorMessage(error, "The campaign wasn't added. Try again."),
      error.code === "23505" ? { name: "Another campaign already has this name." } : undefined,
    );
  }
  done();
  return ok({ id: data.id });
}

/** Save on blur. An empty cell clears the target. */
export async function saveTarget(input: TargetInput): Promise<ActionResult> {
  const parsed = parseInput(targetSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const metric = parsed.data.metric as TargetMetric;
  if (parsed.data.weeklyValue === null) {
    const { error } = await supabase.from("targets").delete().eq("user_id", parsed.data.userId).eq("metric", metric);
    if (error) return fail(dbErrorMessage(error, "The target wasn't cleared. Try again."));
  } else {
    const { data, error } = await supabase
      .from("targets")
      .upsert(
        { user_id: parsed.data.userId, metric, weekly_value: parsed.data.weeklyValue },
        { onConflict: "user_id,metric" },
      )
      .select("id");
    if (error) return fail(dbErrorMessage(error, "The target wasn't saved. Try again."));
    if (!data.length) return fail(NO_PERMISSION);
  }
  done();
  revalidatePath("/my-day");
  return ok();
}
