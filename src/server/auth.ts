import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/domain";

export type Viewer = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  timezone: string;
  primaryNicheId: string | null;
  /** CSV lead import: always for the founder, for a BD only when the founder allows it (docs/03). */
  canImportLeads: boolean;
  /** The member's office (docs/11). Everything they see belongs to it. */
  officeId: string;
  officeName: string;
  /** The office's default time zone for new members. */
  officeTimezone: string;
  /** The app's owner: may open /admin (docs/11 section 6). Never sees other offices' data. */
  isPlatformAdmin: boolean;
};

/**
 * The signed-in user's profile, loaded once per request.
 * Returns null when signed out, or when RLS hides the profile (deactivated users and suspended offices read nothing).
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const [{ data }, { data: isPlatformAdmin }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, role, timezone, primary_niche_id, is_active, can_import_leads, office_id, offices(name, timezone)")
      .eq("id", userId)
      .maybeSingle(),
    supabase.rpc("is_platform_admin"),
  ]);
  if (!data || !data.is_active || !data.offices) return null;
  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    role: data.role,
    timezone: data.timezone,
    primaryNicheId: data.primary_niche_id,
    canImportLeads: data.role === "founder" || (data.role === "bd" && data.can_import_leads),
    officeId: data.office_id,
    officeName: data.offices.name,
    officeTimezone: data.offices.timezone,
    isPlatformAdmin: isPlatformAdmin === true,
  };
});

/** Why a signed-in user can't read anything: "deactivated" or "suspended" (docs/11 section 5); "active" otherwise. */
export async function accountState(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_account_state");
  return data ?? "signed_out";
}

/** For pages: the viewer, or a redirect to /login (or sign-out if deactivated). */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (viewer) return viewer;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  redirect((await accountState()) === "suspended" ? "/auth/signout?reason=suspended" : "/auth/signout?reason=deactivated");
}

/** For /admin and its server actions: the viewer when they're a platform admin (docs/11 section 6). */
export async function requirePlatformAdmin(): Promise<Viewer | null> {
  const viewer = await getViewer();
  return viewer?.isPlatformAdmin ? viewer : null;
}

export const PLATFORM_ADMIN_ONLY = "Only the app's owner can do that.";

/**
 * For server actions that need founder rights (and before any use of the admin client).
 * Checks with the user's own session, so the database decides.
 */
export async function requireFounder(): Promise<Viewer | null> {
  const viewer = await getViewer();
  return viewer?.role === "founder" ? viewer : null;
}

export const FOUNDER_ONLY = "Only the founder can do that.";
