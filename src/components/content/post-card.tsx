"use client";

import { cn } from "@/lib/utils";
import { useApp } from "@/components/app/app-provider";
import { formatClock } from "@/lib/dates";
import { initials } from "@/lib/format";
import type { PostItem } from "@/server/queries/content";
import { PlatformChip, PostStatusChip } from "./post-status-chip";

export const CARD_CLASS =
  "flex w-full flex-col gap-1 rounded-md border border-line bg-surface px-2 py-1.5 text-left transition-colors hover:border-ink-faint outline-none focus-visible:outline-2 focus-visible:outline-accent-strong";

/** Week-view card content: time (viewer's zone), platform, title, status, assignee initials. */
export function PostCardBody({ post, tz }: { post: PostItem; tz: string }) {
  const { lists } = useApp();
  const account = lists.socialAccounts.find((a) => a.id === post.accountId);
  const assignee = lists.members.find((m) => m.id === post.assigneeId);
  return (
    <>
      <span className="flex items-center gap-1.5">
        <span className="num text-small font-medium text-ink">{post.scheduledAt ? formatClock(post.scheduledAt, tz) : "No time"}</span>
        {account && <PlatformChip platform={account.platform} />}
        <span
          className="ml-auto flex size-5 items-center justify-center rounded-full bg-accent-soft text-micro leading-none text-accent-strong"
          title={assignee?.full_name}
          aria-hidden
        >
          {initials(assignee?.full_name)}
        </span>
      </span>
      <span className={cn("line-clamp-2 text-small text-ink", post.status === "cancelled" && "line-through")}>{post.title}</span>
      <PostStatusChip status={post.status} className="self-start" />
    </>
  );
}

/** A clickable card (no dragging). */
export function PostCard({ post, tz, onOpen, className }: { post: PostItem; tz: string; onOpen: (id: string) => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(post.id)}
      data-testid="post-card"
      data-post-id={post.id}
      className={cn(CARD_CLASS, post.status === "cancelled" && "opacity-70", className)}
    >
      <PostCardBody post={post} tz={tz} />
    </button>
  );
}
