"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLOSED_LEAD_STATUSES } from "@/lib/domain";
import { inviteSchema, memberEditSchema, type InviteInput, type MemberEditInput } from "@/lib/validation/auth";
import { FOUNDER_ONLY, requireFounder } from "@/server/auth";
import { dbErrorMessage, fail, ok, parseInput, type ActionResult } from "@/server/result";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

const idSchema = z.uuid();

export async function inviteMember(input: InviteInput): Promise<ActionResult<{ id: string; email: string }>> {
  const parsed = parseInput(inviteSchema, input);
  if (!parsed.ok) return parsed;
  if (!(await requireFounder())) return fail(FOUNDER_ONLY);

  const { fullName, email, primaryNicheId, timezone } = parsed.data;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${siteUrl()}/accept-invite`,
  });
  if (error || !data.user) {
    if (error?.code === "email_exists" || error?.status === 422) {
      return fail("Someone with this email is already on the team.", { email: "This email is already on the team." });
    }
    return fail("The invite wasn't sent. Check the email address and try again.");
  }

  // The trigger created the profile as a BD; now set niche and time zone.
  const { error: upErr } = await admin
    .from("profiles")
    .update({ full_name: fullName, primary_niche_id: primaryNicheId, timezone })
    .eq("id", data.user.id);
  if (upErr) return fail("The invite was sent, but the niche and time zone weren't saved. Edit the member to set them.");

  revalidatePath("/team");
  return ok({ id: data.user.id, email });
}

export async function resendInvite(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return fail("That member wasn't found.");
  if (!(await requireFounder())) return fail(FOUNDER_ONLY);
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error || !data.user?.email) return fail("That member wasn't found.");
  if (data.user.last_sign_in_at) return fail("They've already joined, so there's no invite to resend.");
  const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(data.user.email, {
    data: data.user.user_metadata,
    redirectTo: `${siteUrl()}/accept-invite`,
  });
  if (inviteErr) return fail("The invite wasn't resent. Try again in a minute.");
  return ok();
}

/** Name, niche and time zone. The founder's own session does this; RLS allows it. */
export async function updateMember(input: MemberEditInput): Promise<ActionResult> {
  const parsed = parseInput(memberEditSchema, input);
  if (!parsed.ok) return parsed;
  if (!(await requireFounder())) return fail(FOUNDER_ONLY);
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      primary_niche_id: parsed.data.primaryNicheId,
      timezone: parsed.data.timezone,
    })
    .eq("id", parsed.data.id);
  if (error) return fail(dbErrorMessage(error, "Changes weren't saved. Try again."));
  revalidatePath("/team");
  return ok();
}

export async function deactivateMember(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return fail("That member wasn't found.");
  const founder = await requireFounder();
  if (!founder) return fail(FOUNDER_ONLY);
  if (founder.id === id) return fail("The founder can't be deactivated.");

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ is_active: false }).eq("id", id);
  if (error) return fail(dbErrorMessage(error, "They weren't deactivated. Try again."));

  const { error: banErr } = await createAdminClient().auth.admin.updateUserById(id, { ban_duration: "876000h" });
  if (banErr) return fail("Their data access is off, but blocking sign-in failed. Try Deactivate again.");
  revalidatePath("/team");
  return ok();
}

export async function reactivateMember(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return fail("That member wasn't found.");
  if (!(await requireFounder())) return fail(FOUNDER_ONLY);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ is_active: true }).eq("id", id);
  if (error) return fail(dbErrorMessage(error, "They weren't reactivated. Try again."));
  const { error: banErr } = await createAdminClient().auth.admin.updateUserById(id, { ban_duration: "none" });
  if (banErr) return fail("Their data access is back, but unblocking sign-in failed. Try Reactivate again.");
  revalidatePath("/team");
  return ok();
}

const reassignAllSchema = z.object({ fromId: z.uuid(), toId: z.uuid("Pick who gets the leads.") });

/** Team → Reassign open leads: every lead not Customer, Lost, Not interested or Bad fit (docs/04 section 5). */
export async function reassignOpenLeads(input: { fromId: string; toId: string }): Promise<ActionResult<{ count: number }>> {
  const parsed = parseInput(reassignAllSchema, input);
  if (!parsed.ok) return parsed;
  if (parsed.data.fromId === parsed.data.toId) return fail("Pick a different person.", { toId: "Pick a different person." });
  if (!(await requireFounder())) return fail(FOUNDER_ONLY);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ owner_id: parsed.data.toId })
    .eq("owner_id", parsed.data.fromId)
    .not("status", "in", `(${CLOSED_LEAD_STATUSES.join(",")})`)
    .select("id");
  if (error) return fail(dbErrorMessage(error, "The leads weren't reassigned. Try again."));
  revalidatePath("/team");
  revalidatePath("/leads");
  return ok({ count: data.length });
}
