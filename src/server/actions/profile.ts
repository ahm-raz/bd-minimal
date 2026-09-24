"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { profileSchema, type ProfileInput } from "@/lib/validation/auth";
import { getViewer } from "@/server/auth";
import { dbErrorMessage, fail, ok, parseInput, type ActionResult } from "@/server/result";

/** Anyone may change their own name and time zone (docs/03). */
export async function updateOwnProfile(input: ProfileInput): Promise<ActionResult> {
  const parsed = parseInput(profileSchema, input);
  if (!parsed.ok) return parsed;
  const viewer = await getViewer();
  if (!viewer) return fail("Your session has ended. Sign in again.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, timezone: parsed.data.timezone })
    .eq("id", viewer.id);
  if (error) return fail(dbErrorMessage(error, "Your profile wasn't saved. Try again."));
  revalidatePath("/", "layout");
  return ok();
}
