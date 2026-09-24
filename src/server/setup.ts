import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Is the app still waiting for its first user? Only /setup asks. */
export async function needsSetup(): Promise<boolean> {
  const { count, error } = await createAdminClient().from("profiles").select("id", { count: "exact", head: true });
  if (error) throw new Error("Couldn't check whether setup is needed.");
  return (count ?? 0) === 0;
}
