import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role client. Bypasses RLS.
 *
 * Only import this from server actions that have ALREADY confirmed the caller (docs/11 section 7):
 * - an active founder (requireFounder in src/server/auth.ts), for members of their OWN office only:
 *   adding and re-inviting, banning and unbanning, setting passwords, and setting niche and time zone on a
 *   freshly added profile (docs/03, s4). Check the member is in the office with the founder's session first.
 * - a platform admin (requirePlatformAdmin), to create a new office's founder user.
 * The one exception is /setup, which runs only while no office exists.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin client is not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
