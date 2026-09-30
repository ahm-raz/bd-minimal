"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/components/app/nav-progress";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, Panel, PanelHeader } from "@/components/common/page";
import { PaceBar } from "@/components/common/pace-bar";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { PostRow } from "@/components/content/post-row";
import { RequestChangesDialog } from "@/components/content/post-sheet";
import { PlatformChip } from "@/components/content/post-status-chip";
import { formatDualZone, formatLocalDate } from "@/lib/dates";
import { dailyTarget, dayPaceMarker } from "@/lib/metrics";
import { useNow } from "@/lib/use-now";
import { movePost } from "@/server/actions/content";
import type { PostItem, SocialDay } from "@/server/queries/content";
import type { TaskItem } from "@/server/queries/tasks";
import { MyDayTasks } from "./my-day-tasks";

/** My Day for a social media manager (docs/09 section 4). */
export function SocialDayView({
  data,
  tasks,
  founderName,
}: {
  data: SocialDay;
  tasks: TaskItem[];
  founderName: string;
}) {
  const { openPostSheet } = useApp();
  const profile = useProfile();
  const now = useNow();
  const daily = data.weeklyTarget !== null ? dailyTarget(data.weeklyTarget) : null;

  return (
    <>
      <PageHeader
        title="My Day"
        meta={<span data-testid="today">{formatLocalDate(data.today)}</span>}
        actions={
          <Button variant="secondary" onClick={() => openPostSheet({ mode: "idea" })}>
            <Lightbulb aria-hidden /> Suggest an idea
          </Button>
        }
      />

      <Panel className="mb-6" aria-label="Today so far">
        <PanelHeader title="Today so far" />
        <div className="p-4 sm:max-w-md" data-testid="counter-posts_published">
          {daily !== null ? (
            <PaceBar
              label="Posts published"
              actual={data.postedToday}
              target={daily}
              pace={now ? dayPaceMarker(daily, profile.timezone, now) : null}
            />
          ) : (
            <p className="text-body text-ink">
              Posts published <span className="ml-2 num font-medium">{data.postedToday}</span>
            </p>
          )}
        </div>
      </Panel>

      <Panel className="mb-6" aria-label="Today's posts">
        <PanelHeader title="Today's posts" meta={<span className="num">{data.todayPosts.length}</span>} />
        {data.todayPosts.length === 0 ? (
          <EmptyState
            action={
              <Button variant="secondary" asChild>
                <Link href="/content">Open Content</Link>
              </Button>
            }
          >
            Nothing to post today. Get ahead on the next drafts.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line" data-testid="todays-posts">
            {data.todayPosts.map((p) => (
              <PostRow key={p.id} post={p} />
            ))}
          </ul>
        )}
      </Panel>

      {data.changesRequested.length > 0 && (
        <Panel className="mb-6" aria-label="Changes requested">
          <PanelHeader title="Changes requested" meta={<span className="num">{data.changesRequested.length}</span>} />
          <ul className="divide-y divide-line" data-testid="changes-requested">
            {data.changesRequested.map((p) => (
              <PostRow key={p.id} post={p} />
            ))}
          </ul>
        </Panel>
      )}

      <Panel className="mb-6" aria-label="Drafts due">
        <PanelHeader title="Drafts due" meta="Next 48 hours" />
        {data.draftsDue.length === 0 ? (
          <EmptyState>No drafts due in the next 48 hours.</EmptyState>
        ) : (
          <ul className="divide-y divide-line" data-testid="drafts-due">
            {data.draftsDue.map((p) => (
              <PostRow key={p.id} post={p} at="draft" />
            ))}
          </ul>
        )}
      </Panel>

      <MyDayTasks today={data.today} tasks={tasks} founderName={founderName} />
    </>
  );
}

/** Founder's My Day additions: posts waiting for review (oldest first) and today's posts. */
export function FounderSocialBlocks({ review, todayPosts }: { review: PostItem[]; todayPosts: PostItem[] }) {
  const { lists, openPostSheet } = useApp();
  const profile = useProfile();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [changing, setChanging] = useState<string | null>(null);
  const approve = (p: PostItem) =>
    startTransition(async () => {
      const res = await movePost({ id: p.id, move: "approve" });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Post approved");
      router.refresh();
    });

  return (
    <>
      <Panel className="mb-6" aria-label="Needs your review">
        <PanelHeader
          title="Needs your review"
          meta={<span className="num">{review.length}</span>}
          actions={
            review.length > 0 && (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/content?view=review">Open Content</Link>
              </Button>
            )
          }
        />
        {review.length === 0 ? (
          <EmptyState>Nothing waiting for review.</EmptyState>
        ) : (
          <ul className="divide-y divide-line" data-testid="needs-review">
            {review.map((p) => {
              const account = lists.socialAccounts.find((a) => a.id === p.accountId);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  {account && <PlatformChip platform={account.platform} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{p.title}</span>
                    <span className="block text-small text-ink-muted">
                      {lists.members.find((m) => m.id === p.assigneeId)?.full_name}
                      {p.scheduledAt ? `, goes out ${formatDualZone(p.scheduledAt, p.timezone, profile.timezone)}` : ""}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => openPostSheet({ mode: "open", id: p.id })}>
                    Open<span className="sr-only">: {p.title}</span>
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setChanging(p.id)}>
                    Request changes<span className="sr-only">: {p.title}</span>
                  </Button>
                  <Button size="sm" disabled={pending} onClick={() => approve(p)}>
                    Approve<span className="sr-only">: {p.title}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {changing && (
        <RequestChangesDialog
          postId={changing}
          onClose={() => setChanging(null)}
          onDone={async () => router.refresh()}
        />
      )}
      <Panel className="mb-6" aria-label="Today's posts">
        <PanelHeader title="Today's posts" meta={<span className="num">{todayPosts.length}</span>} />
        {todayPosts.length === 0 ? (
          <EmptyState>No posts scheduled today.</EmptyState>
        ) : (
          <ul className="divide-y divide-line" data-testid="todays-posts">
            {todayPosts.map((p) => (
              <PostRow key={p.id} post={p} showAssignee />
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
