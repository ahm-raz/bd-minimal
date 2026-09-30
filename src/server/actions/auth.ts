"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  forgotPasswordSchema,
  loginSchema,
  newPasswordSchema,
  setupSchema,
  type LoginInput,
  type NewPasswordInput,
  type SetupInput,
} from "@/lib/validation/auth";
import { fail, ok, parseInput, type ActionResult } from "@/server/result";
import { needsSetup } from "@/server/setup";

const DEACTIVATED = "Your access has been turned off. Contact the founder.";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function signIn(input: LoginInput): Promise<ActionResult> {
  const parsed = parseInput(loginSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "user_banned") return fail(DEACTIVATED);
    if (error.code === "invalid_credentials" || error.status === 400) return fail("Email or password is incorrect.");
    return fail("Sign-in isn't available right now. Try again in a minute.");
  }
  // A session for a deactivated profile reads nothing; don't let it in.
  const { data: profile } = await supabase.from("profiles").select("is_active").eq("id", data.user.id).maybeSingle();
  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return fail(DEACTIVATED);
  }
  return ok();
}

export async function requestPasswordReset(input: { email: string }): Promise<ActionResult> {
  const parsed = parseInput(forgotPasswordSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${siteUrl()}/reset-password` });
  // Too many requests is about the sender, not the address, so it's safe to say.
  if (error && (error.status === 429 || error.code === "over_email_send_rate_limit")) {
    return fail("Too many reset emails were sent. Wait a few minutes, then try again.");
  }
  // Otherwise the result is the same whether or not the address exists, so nothing is revealed.
  return ok();
}

export async function setNewPassword(input: NewPasswordInput): Promise<ActionResult> {
  const parsed = parseInput(newPasswordSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return fail("This link has expired. Ask for a new one.");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return fail("Pick a password you haven't used here before.", { password: "Pick a new password." });
    if (error.code === "weak_password") return fail("That password is too easy to guess. Try a longer one.", { password: "Try a longer password." });
    return fail("The password wasn't saved. Try again.");
  }
  return ok();
}

/**
 * First-run only: create the founder. Refuses once any profile exists (docs/03, First setup).
 * The admin client is allowed here because no founder exists to check against yet.
 */
export async function setupFounder(input: SetupInput): Promise<ActionResult> {
  const parsed = parseInput(setupSchema, input);
  if (!parsed.ok) return parsed;
  if (!(await needsSetup())) return fail("Setup is already done. Sign in instead.");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });
  if (error || !data.user) return fail("The founder account wasn't created. Check the details and try again.");

  // The trigger has created the profile as founder; set the time zone.
  await admin.from("profiles").update({ timezone: parsed.data.timezone }).eq("id", data.user.id);

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (signInError) return fail("Your account is ready, but signing in failed. Go to the login page.");
  return ok();
}
