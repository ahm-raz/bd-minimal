import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Unread "What happened" count for the bell's first render; also prunes old items now and then. */
export async function unreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  // Clean-up is cheap and idempotent; about one page load in twenty is plenty (docs/10 section 3).
  if (Math.random() < 0.05) await supabase.rpc("prune_my_notifications");
  return count ?? 0;
}
