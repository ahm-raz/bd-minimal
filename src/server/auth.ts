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
};

/**
 * The signed-in user's profile, loaded once per request.
 * Returns null when signed out, or when RLS hides the profile (deactivated users read nothing).
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, timezone, primary_niche_id, is_active, can_import_leads")
    .eq("id", userId)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    role: data.role,
    timezone: data.timezone,
    primaryNicheId: data.primary_niche_id,
    canImportLeads: data.role === "founder" || (data.role === "bd" && data.can_import_leads),
  };
});

/** For pages: the viewer, or a redirect to /login (or sign-out if deactivated). */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (viewer) return viewer;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  redirect(data?.claims?.sub ? "/auth/signout?reason=deactivated" : "/login");
}

/**
 * For server actions that need founder rights (and before any use of the admin client).
 * Checks with the user's own session, so the database decides.
 */
export async function requireFounder(): Promise<Viewer | null> {
  const viewer = await getViewer();
  return viewer?.role === "founder" ? viewer : null;
}

export const FOUNDER_ONLY = "Only the founder can do that.";
