import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Is the app still waiting for its first office? Only /setup asks (docs/11 section 6). */
export async function needsSetup(): Promise<boolean> {
  const { count, error } = await createAdminClient().from("offices").select("id", { count: "exact", head: true });
  if (error) throw new Error("Couldn't check whether setup is needed.");
  return (count ?? 0) === 0;
}
