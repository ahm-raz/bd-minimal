"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/server/auth";
import { decryptToken } from "@/server/google/crypto";
import { revokeToken } from "@/server/google/oauth";
import { syncMyPending } from "@/server/google/sync";
import { dbErrorMessage, fail, ok, parseInput, type ActionResult } from "@/server/result";

/** Disconnect: revoke our access at Google, forget the token, stop syncing (docs/10 section 2). */
export async function disconnectGoogle(): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail("Your session has ended. Sign in again.");
  const supabase = await createClient();
  const { data: conn } = await supabase.rpc("my_google_token").maybeSingle();
  if (conn) {
    try {
      await revokeToken(decryptToken(conn.refresh_token_enc));
    } catch {
      // Removed on our side regardless; the user can also remove it in their Google Account.
    }
  }
  const { error } = await supabase.from("google_connections").delete().eq("user_id", viewer.id);
  if (error) return fail(dbErrorMessage(error, "Google Calendar wasn't disconnected. Try again."));
  await supabase
    .from("meetings")
    .update({ gcal_state: "off", gcal_error: null, gcal_next_retry_at: null })
    .eq("owner_id", viewer.id)
    .in("gcal_state", ["pending", "failed"]);
  revalidatePath("/profile");
  return ok();
}

export async function setGoogleAutoAdd(input: { autoAdd: boolean }): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail("Your session has ended. Sign in again.");
  const parsed = parseInput(z.object({ autoAdd: z.boolean() }), input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { error } = await supabase
    .from("google_connections")
    .update({ auto_add: parsed.data.autoAdd })
    .eq("user_id", viewer.id);
  if (error) return fail(dbErrorMessage(error, "That setting didn't save. Try again."));
  revalidatePath("/profile");
  return ok();
}

/** "Sync now" on Profile: due retries and old events, right away. */
export async function syncCalendarNow(): Promise<ActionResult> {
  if (!(await getViewer())) return fail("Your session has ended. Sign in again.");
  await syncMyPending();
  revalidatePath("/profile");
  return ok();
}
