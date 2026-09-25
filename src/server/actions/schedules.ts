"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayIn } from "@/lib/dates";
import { SLOT_HORIZON_DAYS } from "@/lib/social";
import { scheduleSchema, socialAccountSchema, type ScheduleValues, type SocialAccountValues } from "@/lib/validation/social";
import { requireViewer } from "@/server/auth";
import { dbErrorMessage, fail, ok, parseInput, type ActionResult } from "@/server/result";

/*
 * Posting schedules and social accounts: founder only, enforced by RLS. Saving a schedule creates its
 * slots for the next 28 days right away (ensure_post_slots), so Content shows them at once.
 */

const NO_PERMISSION = "Only the founder can change posting schedules.";

async function fillSlots() {
  const viewer = await requireViewer();
  const today = todayIn(viewer.timezone);
  const supabase = await createClient();
  await supabase.rpc("ensure_post_slots", { p_from: addDays(today, -1), p_to: addDays(today, SLOT_HORIZON_DAYS) });
}

export async function saveSchedule(input: ScheduleValues): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(scheduleSchema, input);
  if (!parsed.ok) return parsed;
  const v = parsed.data;
  const supabase = await createClient();
  const row = {
    account_id: v.accountId,
    assignee_id: v.assigneeId,
    weekdays: [...new Set(v.weekdays)].sort(),
    local_time: v.localTime,
    timezone: v.timezone,
    pillar_id: v.pillarId,
    default_format: v.defaultFormat,
    needs_approval: v.needsApproval,
    draft_lead_hours: v.draftLeadHours,
    starts_on: v.startsOn,
    ends_on: v.endsOn,
  };
  let id = v.id;
  if (id) {
    const { data, error } = await supabase.from("posting_schedules").update(row).eq("id", id).select("id");
    if (error) return fail(dbErrorMessage(error, "The schedule wasn't saved. Try again."));
    if (!data.length) return fail(NO_PERMISSION);
  } else {
    const { data, error } = await supabase.from("posting_schedules").insert(row).select("id").single();
    if (error) return fail(dbErrorMessage(error, "The schedule wasn't created. Try again."));
    id = data.id;
  }
  await fillSlots();
  revalidatePath("/content", "layout");
  return ok({ id });
}

/** Stop schedule: no new slots, and its future planned slots are cancelled (SQL trigger). */
export async function stopSchedule(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return fail("That schedule wasn't found.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("posting_schedules").update({ is_active: false }).eq("id", id).select("id");
  if (error) return fail(dbErrorMessage(error, "The schedule wasn't stopped. Try again."));
  if (!data.length) return fail(NO_PERMISSION);
  revalidatePath("/content", "layout");
  return ok();
}

export async function saveSocialAccount(input: SocialAccountValues): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(socialAccountSchema, input);
  if (!parsed.ok) return parsed;
  const v = parsed.data;
  const supabase = await createClient();
  const row = {
    name: v.name,
    platform: v.platform,
    profile_url: v.profileUrl,
    audience_timezone: v.audienceTimezone,
    is_active: v.isActive,
  };
  const nameTaken = { name: "Another account already has this name." };
  if (v.id) {
    const { data, error } = await supabase.from("social_accounts").update(row).eq("id", v.id).select("id");
    if (error) return fail(dbErrorMessage(error, "The account wasn't saved. Try again."), error.code === "23505" ? nameTaken : undefined);
    if (!data.length) return fail("Only the founder can change social accounts.");
    revalidatePath("/", "layout");
    return ok({ id: v.id });
  }
  const { data: last } = await supabase
    .from("social_accounts")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("social_accounts")
    .insert({ ...row, sort_order: (last?.sort_order ?? 0) + 1 })
    .select("id")
    .single();
  if (error) return fail(dbErrorMessage(error, "The account wasn't added. Try again."), error.code === "23505" ? nameTaken : undefined);
  revalidatePath("/", "layout");
  return ok({ id: data.id });
}
