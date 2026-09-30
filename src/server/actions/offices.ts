"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createOfficeSchema,
  officeEditSchema,
  officeSettingsSchema,
  officeStatusSchema,
  type CreateOfficeInput,
  type OfficeEditInput,
  type OfficeSettingsInput,
} from "@/lib/validation/offices";
import { FOUNDER_ONLY, PLATFORM_ADMIN_ONLY, requireFounder, requirePlatformAdmin } from "@/server/auth";
import { emailInvitesEnabled } from "@/server/email";
import { dbErrorMessage, fail, ok, parseInput, type ActionResult } from "@/server/result";

const EMAIL_TAKEN = "This email already has an account. Use a different email.";
const NOT_FOUND = "That office wasn't found.";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/** Settings → Office: the founder renames their office or changes its default time zone (docs/11 section 6). */
export async function updateMyOffice(input: OfficeSettingsInput): Promise<ActionResult> {
  const parsed = parseInput(officeSettingsSchema, input);
  if (!parsed.ok) return parsed;
  const founder = await requireFounder();
  if (!founder) return fail(FOUNDER_ONLY);
  const supabase = await createClient();
  const { error } = await supabase
    .from("offices")
    .update({ name: parsed.data.name, timezone: parsed.data.timezone })
    .eq("id", founder.officeId);
  if (error) return fail(dbErrorMessage(error, "The office wasn't saved. Try again."));
  revalidatePath("/", "layout");
  return ok();
}

/**
 * /admin → Create office. create_office (checked in the database: platform admins only) makes the office, its
 * default settings and the founder's reservation; the admin client then creates the founder's auth user.
 * If that fails, the empty office is removed so the form can be sent again.
 */
export async function createOffice(input: CreateOfficeInput): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(createOfficeSchema, input);
  if (!parsed.ok) return parsed;
  if (!(await requirePlatformAdmin())) return fail(PLATFORM_ADMIN_ONLY);
  const { name, timezone, seatLimit, founderName, founderEmail, method, password } = parsed.data;
  if (method === "email" && !emailInvitesEnabled()) {
    return fail("Invite emails are off until an email domain is set up. Set a password instead.");
  }

  const supabase = await createClient();
  const { data: officeId, error: officeError } = await supabase.rpc("create_office", {
    p_name: name,
    p_timezone: timezone,
    p_seat_limit: seatLimit as number,
    p_founder_email: founderEmail,
  });
  if (officeError || !officeId) {
    if (officeError?.code === "23505") return fail(EMAIL_TAKEN, { founderEmail: EMAIL_TAKEN });
    return fail(dbErrorMessage(officeError, "The office wasn't created. Try again."));
  }

  const admin = createAdminClient();
  const { data, error } =
    method === "password"
      ? await admin.auth.admin.createUser({ email: founderEmail, password, email_confirm: true, user_metadata: { full_name: founderName } })
      : await admin.auth.admin.inviteUserByEmail(founderEmail, {
          data: { full_name: founderName },
          redirectTo: `${siteUrl()}/accept-invite`,
        });
  if (error || !data.user) {
    await supabase.rpc("discard_empty_office", { p_office: officeId });
    if (error?.code === "weak_password") return fail("Pick a stronger password.", { password: "Pick a stronger password." });
    if (error?.code === "email_exists" || error?.code === "user_already_exists") return fail(EMAIL_TAKEN, { founderEmail: EMAIL_TAKEN });
    return fail("The founder's account wasn't created, so the office wasn't either. Try again.");
  }

  revalidatePath("/admin");
  return ok({ id: officeId });
}

/** /admin → Edit: name and seats. The database lets only a platform admin change seats. */
export async function updateOffice(input: OfficeEditInput): Promise<ActionResult> {
  const parsed = parseInput(officeEditSchema, input);
  if (!parsed.ok) return parsed;
  if (!(await requirePlatformAdmin())) return fail(PLATFORM_ADMIN_ONLY);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offices")
    .update({ name: parsed.data.name, seat_limit: parsed.data.seatLimit })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fail(dbErrorMessage(error, "The office wasn't saved. Try again."));
  if (!data?.length) return fail(NOT_FOUND);
  revalidatePath("/admin");
  return ok();
}

/** /admin → Suspend or Reactivate. Nothing is deleted (docs/11 section 5). */
export async function setOfficeStatus(input: { id: string; status: "active" | "suspended" }): Promise<ActionResult> {
  const parsed = parseInput(officeStatusSchema, input);
  if (!parsed.ok) return parsed;
  const admin = await requirePlatformAdmin();
  if (!admin) return fail(PLATFORM_ADMIN_ONLY);
  if (parsed.data.status === "suspended" && parsed.data.id === admin.officeId) {
    return fail("You can't suspend your own office.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offices")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fail(dbErrorMessage(error, "That didn't save. Try again."));
  if (!data?.length) return fail(NOT_FOUND);
  revalidatePath("/admin");
  return ok();
}
