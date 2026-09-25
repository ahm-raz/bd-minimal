"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { formatCountdown, formatDualZone } from "@/lib/dates";
import { allowedPostActions, POST_ACTION_LABELS } from "@/lib/social";
import { useNow } from "@/lib/use-now";
import type { PostItem } from "@/server/queries/content";
import { PlatformChip, PostStatusChip } from "./post-status-chip";

/** Ready to go out: approved, or drafting when no approval is needed. */
export function isReady(p: PostItem) {
  return p.status === "approved" || p.status === "posted" || (p.status === "drafting" && !p.needsApproval);
}

/**
 * One post in a My Day list: both times, a countdown, status and one primary action (opens the post).
 * Amber when it's due within 60 minutes and not ready; red when missed (docs/09 section 4).
 */
export function PostRow({ post, at = "scheduled", showAssignee }: { post: PostItem; at?: "scheduled" | "draft"; showAssignee?: boolean }) {
  const { lists, openPostSheet } = useApp();
  const profile = useProfile();
  const now = useNow();
  const account = lists.socialAccounts.find((a) => a.id === post.accountId);
  const when = at === "draft" ? post.draftDueAt : post.scheduledAt;
  const ms = when && now ? new Date(when).getTime() - now.getTime() : null;
  const urgent = at === "scheduled" && ms !== null && ms > 0 && ms <= 3_600_000 && !isReady(post);
  const missed = post.status === "missed";
  const action = allowedPostActions({
    role: profile.role,
    isAssignee: post.assigneeId === profile.id,
    status: post.status,
    needsApproval: post.needsApproval,
  }).find((a) => a !== "cancel" && a !== "schedule");
  const assignee = showAssignee ? lists.members.find((m) => m.id === post.assigneeId)?.full_name : null;

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5",
        urgent && "bg-warn-soft",
        missed && "bg-bad-soft",
      )}
      data-testid="post-row"
      data-post-id={post.id}
    >
      {account && <PlatformChip platform={account.platform} />}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-ink">{post.title}</span>
        <span className="block text-small text-ink-muted">
          {at === "draft" ? "Draft due " : ""}
          {when ? formatDualZone(when, post.timezone, profile.timezone) : "No time"}
          {assignee ? `, ${assignee}` : ""}
        </span>
      </span>
      {urgent && <span className="text-small font-medium text-warn-ink">Due within the hour and not approved yet</span>}
      {missed && <span className="text-small font-medium text-bad">Missed. Post it and mark it as posted late.</span>}
      {ms !== null && ms > 0 && post.status !== "posted" && (
        <span className="num w-24 text-right text-small text-ink-muted" data-testid="countdown">
          {formatCountdown(when!, now!)}
        </span>
      )}
      <PostStatusChip status={post.status} />
      <Button size="sm" variant={action && action !== "add_results" ? "default" : "secondary"} onClick={() => openPostSheet({ mode: "open", id: post.id })}>
        {action ? POST_ACTION_LABELS[action] : "Open"}
        <span className="sr-only">: {post.title}</span>
      </Button>
    </li>
  );
}
