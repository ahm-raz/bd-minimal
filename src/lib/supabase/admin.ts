import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role client. Bypasses RLS.
 *
 * Only import this from server actions that have ALREADY confirmed the caller
 * is an active founder (see requireFounder in src/server/auth.ts). It is used
 * for exactly: inviting and re-inviting users, banning and unbanning users,
 * and setting niche and time zone on a freshly invited profile (docs/03, s4).
 * The one exception is /setup, which runs only while no profile exists.
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
