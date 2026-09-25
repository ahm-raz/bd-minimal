"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { FEED_GROUP_KEYS, FEED_PAGE, kindsFor, type FeedEvent, type FeedGroup } from "@/lib/feed";
import { ok, fail, type ActionResult } from "@/server/result";

const schema = z.object({
  fromUtc: z.iso.datetime({ offset: true }),
  toUtc: z.iso.datetime({ offset: true }),
  person: z.uuid().nullable().optional(),
  groups: z.array(z.enum(FEED_GROUP_KEYS as [FeedGroup, ...FeedGroup[]])).optional().default([]),
  beforeId: z.number().int().positive().nullable().optional(),
});
export type FeedQuery = z.input<typeof schema>;

/**
 * A page of feed events, newest first. Only the founder can read feed_events (RLS);
 * a BD calling this gets an empty list.
 */
export async function loadFeed(input: FeedQuery): Promise<ActionResult<FeedEvent[]>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("The feed couldn't be loaded.");
  const { fromUtc, toUtc, person, groups, beforeId } = parsed.data;
  const supabase = await createClient();
  let q = supabase
    .from("feed_events")
    .select("id, kind, actor_id, subject_user_id, lead_id, opportunity_id, task_id, post_id, summary, created_at, leads(company_name)")
    .gte("created_at", fromUtc)
    .lt("created_at", toUtc)
    .order("id", { ascending: false })
    .limit(FEED_PAGE);
  if (person) q = q.or(`subject_user_id.eq.${person},actor_id.eq.${person}`);
  if (groups.length) q = q.in("kind", kindsFor(groups));
  if (beforeId) q = q.lt("id", beforeId);
  const { data, error } = await q;
  if (error) return fail("The feed couldn't be loaded. Refresh the page.");
  return ok(
    (data ?? []).map((e) => ({
      id: e.id,
      kind: e.kind,
      actorId: e.actor_id,
      subjectUserId: e.subject_user_id,
      leadId: e.lead_id,
      opportunityId: e.opportunity_id,
      taskId: e.task_id,
      postId: e.post_id,
      summary: e.summary,
      createdAt: e.created_at,
      company: e.leads?.company_name ?? null,
    })),
  );
}
