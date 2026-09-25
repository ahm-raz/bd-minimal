"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { localDateTimeToUtc, shiftLocalDays } from "@/lib/dates";
import {
  commentSchema,
  ideaSchema,
  markPostedSchema,
  postBriefSchema,
  postedAtError,
  postIdSchema,
  postWorkSchema,
  requestChangesSchema,
  rescheduleSchema,
  resultsSchema,
  type IdeaValues,
  type MarkPostedValues,
  type PostBriefValues,
  type PostWorkValues,
  type ResultsValues,
} from "@/lib/validation/social";
import { requireViewer } from "@/server/auth";
import { getPostDetail, type PostComment, type PostEvent, type PostItem } from "@/server/queries/content";
import { dbErrorMessage, fail, ok, parseInput, type ActionResult } from "@/server/result";

/*
 * Content actions run with the caller's own session. guard_post_write (SQL) decides who may change
 * which fields and which status moves are allowed; its messages come back as the error text.
 */

const NOT_FOUND = "That post wasn't found, or it isn't yours.";

function done() {
  revalidatePath("/content", "layout");
  revalidatePath("/my-day");
}

export async function loadPost(
  id: string,
): Promise<ActionResult<{ post: PostItem; comments: PostComment[]; events: PostEvent[] }>> {
  const parsed = parseInput(postIdSchema, { id });
  if (!parsed.ok) return fail(NOT_FOUND);
  const detail = await getPostDetail(parsed.data.id);
  return detail ? ok(detail) : fail(NOT_FOUND);
}

/** New post, edit the brief, or schedule an idea (founder). The time is entered in the account's zone. */
export async function savePostBrief(input: PostBriefValues): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(postBriefSchema, input);
  if (!parsed.ok) return parsed;
  const v = parsed.data;
  const supabase = await createClient();
  const { data: account } = await supabase.from("social_accounts").select("audience_timezone").eq("id", v.accountId).maybeSingle();
  if (!account) return fail("Check the highlighted fields.", { accountId: "Pick an account." });
  const scheduledAt = localDateTimeToUtc(v.scheduledLocal, account.audience_timezone);
  if (!scheduledAt) return fail("Check the highlighted fields.", { scheduledLocal: "Pick a date and time." });

  const row = {
    account_id: v.accountId,
    assignee_id: v.assigneeId,
    title: v.title,
    brief: v.brief,
    pillar_id: v.pillarId,
    format: v.format,
    campaign_id: v.campaignId,
    needs_approval: v.needsApproval,
    scheduled_at: scheduledAt.toISOString(),
    timezone: account.audience_timezone,
  };

  if (v.id) {
    const { data: current } = await supabase.from("posts").select("status, scheduled_at").eq("id", v.id).maybeSingle();
    if (!current) return fail(NOT_FOUND);
    const { data, error } = await supabase
      .from("posts")
      .update({ ...row, ...(current.status === "idea" ? { status: "planned" as const } : {}) })
      .eq("id", v.id)
      .select("id");
    if (error) return fail(dbErrorMessage(error, "The post wasn't saved. Try again."));
    if (!data.length) return fail(NOT_FOUND);
    done();
    return ok({ id: v.id });
  }

  const { data, error } = await supabase.from("posts").insert({ ...row, status: "planned" }).select("id").single();
  if (error) return fail(dbErrorMessage(error, "The post wasn't created. Try again."));
  done();
  return ok({ id: data.id });
}

/** Suggest an idea (social media manager): an idea post assigned to themself, with no time yet. */
export async function suggestIdea(input: IdeaValues): Promise<ActionResult<{ id: string }>> {
  const parsed = parseInput(ideaSchema, input);
  if (!parsed.ok) return parsed;
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .insert({
      account_id: parsed.data.accountId,
      assignee_id: viewer.id,
      created_by: viewer.id,
      title: parsed.data.title,
      brief: parsed.data.brief,
      pillar_id: parsed.data.pillarId,
      format: parsed.data.format,
      status: "idea",
    })
    .select("id")
    .single();
  if (error) return fail(dbErrorMessage(error, "The idea wasn't saved. Try again."));
  done();
  return ok({ id: data.id });
}

/** Caption, hashtags, first comment, CTA link and media links (assignee or founder). */
export async function savePostWork(input: PostWorkValues): Promise<ActionResult<{ status: string }>> {
  const parsed = parseInput(postWorkSchema, input);
  if (!parsed.ok) return parsed;
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .update({
      caption: v.caption,
      hashtags: v.hashtags,
      first_comment: v.firstComment,
      cta_link: v.ctaLink,
      media_links: v.mediaLinks,
    })
    .eq("id", v.id)
    .select("status");
  if (error) return fail(dbErrorMessage(error, "Your changes weren't saved. Try again."));
  if (!data.length) return fail(NOT_FOUND);
  done();
  // An approved caption that changes goes back to review (the trigger does it); the form says so.
  return ok({ status: data[0]!.status });
}

/** Drag on the week view (founder): move by whole days, same local time in the post's zone. */
export async function reschedulePost(input: { id: string; shiftDays: number }): Promise<ActionResult> {
  const parsed = parseInput(rescheduleSchema, input);
  if (!parsed.ok) return fail(parsed.error);
  const supabase = await createClient();
  const { data: post } = await supabase.from("posts").select("scheduled_at, timezone").eq("id", parsed.data.id).maybeSingle();
  if (!post?.scheduled_at) return fail(NOT_FOUND);
  const next = shiftLocalDays(post.scheduled_at, post.timezone ?? "UTC", parsed.data.shiftDays);
  const { data, error } = await supabase
    .from("posts")
    .update({ scheduled_at: next.toISOString() })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fail(dbErrorMessage(error, "The post wasn't moved. Try again."));
  if (!data.length) return fail(NOT_FOUND);
  done();
  return ok();
}

const MOVES = {
  start_drafting: { to: "drafting", error: "Drafting didn't start. Try again." },
  submit: { to: "in_review", error: "It wasn't sent for review. Try again." },
  approve: { to: "approved", error: "The post wasn't approved. Try again." },
  cancel: { to: "cancelled", error: "The post wasn't cancelled. Try again." },
} as const;
export type PostMove = keyof typeof MOVES;

/** Start drafting, Submit for review, Approve, Cancel post. The database checks the move. */
export async function movePost(input: { id: string; move: PostMove }): Promise<ActionResult> {
  const parsed = parseInput(postIdSchema, { id: input.id });
  if (!parsed.ok || !(input.move in MOVES)) return fail(NOT_FOUND);
  const move = MOVES[input.move];
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data, error } = await supabase.from("posts").update({ status: move.to }).eq("id", parsed.data.id).select("id");
  if (error) return fail(dbErrorMessage(error, move.error));
  if (!data.length) return fail(NOT_FOUND);
  if (input.move === "approve") {
    await supabase
      .from("post_comments")
      .insert({ post_id: parsed.data.id, author_id: viewer.id, kind: "approval", body: "Approved." });
  }
  done();
  return ok();
}

/** Request changes (founder): the comment and the status change happen together in SQL. */
export async function requestChanges(input: { postId: string; body: string }): Promise<ActionResult> {
  const parsed = parseInput(requestChangesSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_post_changes", { p_post: parsed.data.postId, p_body: parsed.data.body });
  if (error) return fail(dbErrorMessage(error, "Changes weren't requested. Try again."));
  done();
  return ok();
}

/** Mark as posted: the live link, and when it went out (the viewer's time; empty = now). */
export async function markPosted(input: MarkPostedValues): Promise<ActionResult> {
  const parsed = parseInput(markPostedSchema, input);
  if (!parsed.ok) return parsed;
  const viewer = await requireViewer();
  const postedAt = parsed.data.postedLocal ? localDateTimeToUtc(parsed.data.postedLocal, viewer.timezone) : new Date();
  if (!postedAt) return fail("Check the highlighted fields.", { postedLocal: "Pick a date and time." });
  const timeError = postedAtError(postedAt);
  if (timeError) return fail("Check the highlighted fields.", { postedLocal: timeError });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .update({ status: "posted", post_url: parsed.data.postUrl, posted_at: postedAt.toISOString() })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fail(dbErrorMessage(error, "It wasn't marked as posted. Try again."));
  if (!data.length) return fail(NOT_FOUND);
  done();
  revalidatePath("/tasks");
  revalidatePath("/performance");
  return ok();
}

export async function saveResults(input: ResultsValues): Promise<ActionResult> {
  const parsed = parseInput(resultsSchema, input);
  if (!parsed.ok) return parsed;
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .update({
      impressions: v.impressions,
      reactions: v.reactions,
      comments_count: v.commentsCount,
      shares: v.shares,
      clicks: v.clicks,
    })
    .eq("id", v.id)
    .select("id");
  if (error) return fail(dbErrorMessage(error, "The results weren't saved. Try again."));
  if (!data.length) return fail(NOT_FOUND);
  done();
  revalidatePath("/performance");
  return ok();
}

export async function addPostComment(input: { postId: string; body: string }): Promise<ActionResult> {
  const parsed = parseInput(commentSchema, input);
  if (!parsed.ok) return parsed;
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { error } = await supabase
    .from("post_comments")
    .insert({ post_id: parsed.data.postId, author_id: viewer.id, kind: "comment", body: parsed.data.body });
  if (error) return fail(dbErrorMessage(error, "The comment wasn't added. Try again."));
  return ok();
}
