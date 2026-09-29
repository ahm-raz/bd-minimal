"use client";

import { ListSkeleton } from "@/components/common/page-skeleton";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Chip } from "@/components/common/chips";
import { FormField } from "@/components/common/form-field";
import { FormSheet } from "@/components/common/form-sheet";
import { SelectField } from "@/components/common/select-field";
import { RelativeTime } from "@/components/common/relative-time";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { applyFieldErrors } from "@/lib/forms";
import { formatNumber } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { formatDayTime, formatDualZone, localDateTimeToUtc, toLocalDateTimeInput, zoneCity } from "@/lib/dates";
import {
  allowedPostActions,
  canEditWork,
  COMMENT_KIND_LABELS,
  FORMAT_LABELS,
  isLate,
  POST_ACTION_LABELS,
  POST_FORMATS,
  RESULTS_NUDGE_HOURS,
  type PostAction,
  type PostCommentKind,
} from "@/lib/social";
import {
  ideaSchema,
  markPostedSchema,
  MAX_MEDIA_LINKS,
  postBriefSchema,
  postWorkSchema,
  resultsSchema,
  type IdeaValues,
  type MarkPostedValues,
  type PostBriefValues,
  type PostWorkValues,
  type ResultsValues,
} from "@/lib/validation/social";
import {
  addPostComment,
  loadPost,
  markPosted,
  movePost,
  requestChanges,
  savePostBrief,
  savePostWork,
  saveResults,
  suggestIdea,
  type PostMove,
} from "@/server/actions/content";
import type { PostComment, PostItem } from "@/server/queries/content";
import { CaptionCounter } from "./caption-counter";
import { PlatformChip, PostStatusChip } from "./post-status-chip";

/** The global post side panel (docs/09 section 4). */
export function PostSheet() {
  const { postSheet, closePostSheet } = useApp();
  if (!postSheet) return null;
  if (postSheet.mode === "new") return <NewPostSheet key={`new-${postSheet.day ?? ""}`} day={postSheet.day} onClose={closePostSheet} />;
  if (postSheet.mode === "idea") return <IdeaSheet onClose={closePostSheet} />;
  return <OpenPostSheet key={postSheet.id} id={postSheet.id} onClose={closePostSheet} />;
}

function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">
      {children}
    </p>
  );
}

function useAssignees() {
  const { lists } = useApp();
  // Posts go to social media managers; the founder can also take one.
  return lists.members.filter((m) => m.is_active && m.role !== "bd");
}

// ---------- Brief -----------------------------------------------------------------

type BriefOutput = z.output<typeof postBriefSchema>;

function BriefFields({
  control,
  register,
  errors,
  idPrefix,
}: {
  control: Control<PostBriefValues, unknown, BriefOutput>;
  register: UseFormRegister<PostBriefValues>;
  errors: FieldErrors<PostBriefValues>;
  idPrefix: string;
}) {
  const { lists } = useApp();
  const { timezone } = useProfile();
  const assignees = useAssignees();
  const accountId = useWatch({ control, name: "accountId" });
  const scheduledLocal = useWatch({ control, name: "scheduledLocal" });
  const account = lists.socialAccounts.find((a) => a.id === accountId);
  const accountTz = account?.audience_timezone ?? null;
  const instant = accountTz && scheduledLocal ? localDateTimeToUtc(scheduledLocal, accountTz) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Account" htmlFor={`${idPrefix}-account`} required error={errors.accountId?.message}>
          <Controller
            control={control}
            name="accountId"
            render={({ field }) => (
              <SelectField
                id={`${idPrefix}-account`}
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? "")}
                placeholder="Pick an account"
                options={lists.socialAccounts
                  .filter((a) => a.is_active || a.id === field.value)
                  .map((a) => ({ value: a.id, label: a.name }))}
                invalid={!!errors.accountId}
              />
            )}
          />
        </FormField>
        <FormField label="Assigned to" htmlFor={`${idPrefix}-assignee`} required error={errors.assigneeId?.message}>
          <Controller
            control={control}
            name="assigneeId"
            render={({ field }) => (
              <SelectField
                id={`${idPrefix}-assignee`}
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? "")}
                placeholder="Pick a person"
                options={assignees.map((m) => ({ value: m.id, label: m.full_name || m.email }))}
                invalid={!!errors.assigneeId}
              />
            )}
          />
        </FormField>
      </div>
      <FormField
        label={accountTz ? `Post time (${zoneCity(accountTz)})` : "Post time"}
        htmlFor={`${idPrefix}-time`}
        required
        error={errors.scheduledLocal?.message}
        helper={
          instant
            ? accountTz === timezone
              ? "Same as your time."
              : `Your time: ${formatDayTime(instant, timezone)}`
            : "Entered in the account's audience time zone."
        }
      >
        <Input
          id={`${idPrefix}-time`}
          type="datetime-local"
          aria-invalid={!!errors.scheduledLocal}
          {...register("scheduledLocal")}
        />
      </FormField>
      <FormField label="Title" htmlFor={`${idPrefix}-title`} required error={errors.title?.message}>
        <Input id={`${idPrefix}-title`} aria-invalid={!!errors.title} {...register("title")} />
      </FormField>
      <FormField label="Brief" htmlFor={`${idPrefix}-brief`} error={errors.brief?.message} helper="What to post: the point, the angle, any links.">
        <Textarea id={`${idPrefix}-brief`} rows={3} {...register("brief")} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Pillar" htmlFor={`${idPrefix}-pillar`}>
          <Controller
            control={control}
            name="pillarId"
            render={({ field }) => (
              <SelectField
                id={`${idPrefix}-pillar`}
                value={field.value ?? null}
                onChange={field.onChange}
                noneLabel="No pillar"
                options={lists.pillars.filter((p) => p.is_active || p.id === field.value).map((p) => ({ value: p.id, label: p.name }))}
              />
            )}
          />
        </FormField>
        <FormField label="Format" htmlFor={`${idPrefix}-format`} required error={errors.format?.message}>
          <Controller
            control={control}
            name="format"
            render={({ field }) => (
              <SelectField
                id={`${idPrefix}-format`}
                value={field.value}
                onChange={(v) => v && field.onChange(v)}
                options={POST_FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
              />
            )}
          />
        </FormField>
        <FormField label="Campaign" htmlFor={`${idPrefix}-campaign`}>
          <Controller
            control={control}
            name="campaignId"
            render={({ field }) => (
              <SelectField
                id={`${idPrefix}-campaign`}
                value={field.value ?? null}
                onChange={field.onChange}
                noneLabel="No campaign"
                options={lists.campaigns
                  .filter((c) => c.status === "active" || c.id === field.value)
                  .map((c) => ({ value: c.id, label: c.name }))}
              />
            )}
          />
        </FormField>
      </div>
      <Controller
        control={control}
        name="needsApproval"
        render={({ field }) => (
          <div className="flex items-center gap-2">
            <Switch id={`${idPrefix}-approval`} checked={field.value} onCheckedChange={field.onChange} />
            <Label htmlFor={`${idPrefix}-approval`} className="text-body">
              Needs your approval before posting
            </Label>
          </div>
        )}
      />
    </div>
  );
}

function briefDefaults(post: PostItem | null, fallback: { accountId: string; assigneeId: string; day?: string }): PostBriefValues {
  if (post) {
    return {
      id: post.id,
      accountId: post.accountId,
      assigneeId: post.assigneeId,
      scheduledLocal: post.scheduledAt ? toLocalDateTimeInput(post.scheduledAt, post.timezone) : "",
      title: post.title,
      brief: post.brief ?? "",
      pillarId: post.pillarId,
      format: post.format,
      campaignId: post.campaignId,
      needsApproval: post.needsApproval,
    };
  }
  return {
    accountId: fallback.accountId,
    assigneeId: fallback.assigneeId,
    scheduledLocal: fallback.day ? `${fallback.day}T09:00` : "",
    title: "",
    brief: "",
    pillarId: null,
    format: "text",
    campaignId: null,
    needsApproval: true,
  };
}

function NewPostSheet({ day, onClose }: { day?: string; onClose: () => void }) {
  const { lists, openPostSheet } = useApp();
  const router = useRouter();
  const assignees = useAssignees();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const firstAccount = lists.socialAccounts.find((a) => a.is_active)?.id ?? "";
  const firstSmm = assignees.find((m) => m.role === "social")?.id ?? "";
  const form = useForm<PostBriefValues, unknown, BriefOutput>({
    resolver: zodResolver(postBriefSchema),
    defaultValues: briefDefaults(null, { accountId: firstAccount, assigneeId: firstSmm, day }),
  });

  const submit = form.handleSubmit(() =>
    startTransition(async () => {
      setFormError(null);
      const res = await savePostBrief(form.getValues());
      if (!res.ok) {
        applyFieldErrors(form.setError, res.fieldErrors);
        setFormError(res.error);
        return;
      }
      toast.success("Post created");
      router.refresh();
      openPostSheet({ mode: "open", id: res.data.id });
    }),
  );

  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="New post"
      description="The social media manager sees it on their schedule right away."
      dirty={form.formState.isDirty}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="post-new-form" pending={pending}>
            Create post
          </Button>
        </div>
      }
    >
      {lists.socialAccounts.length === 0 ? (
        <p className="text-body text-ink-muted">Add a social account in Settings → Social accounts first.</p>
      ) : (
        <form id="post-new-form" noValidate className="flex flex-col gap-4" onSubmit={submit}>
          <FormError>{formError}</FormError>
          <BriefFields control={form.control} register={form.register} errors={form.formState.errors} idPrefix="post-new" />
        </form>
      )}
    </FormSheet>
  );
}

// ---------- Suggest an idea (SMM) ---------------------------------------------------

function IdeaSheet({ onClose }: { onClose: () => void }) {
  const { lists } = useApp();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<IdeaValues, unknown, z.output<typeof ideaSchema>>({
    resolver: zodResolver(ideaSchema),
    defaultValues: {
      accountId: lists.socialAccounts.find((a) => a.is_active)?.id ?? "",
      title: "",
      brief: "",
      pillarId: null,
      format: "text",
    },
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(() =>
    startTransition(async () => {
      setFormError(null);
      const res = await suggestIdea(form.getValues());
      if (!res.ok) {
        applyFieldErrors(form.setError, res.fieldErrors);
        setFormError(res.error);
        return;
      }
      toast.success("Idea sent to the founder");
      router.refresh();
      onClose();
    }),
  );

  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Suggest an idea"
      description="The founder picks a time and schedules it."
      dirty={form.formState.isDirty}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="post-idea-form" pending={pending}>
            Suggest idea
          </Button>
        </div>
      }
    >
      <form id="post-idea-form" noValidate className="flex flex-col gap-4" onSubmit={submit}>
        <FormError>{formError}</FormError>
        <FormField label="Account" htmlFor="idea-account" required error={errors.accountId?.message}>
          <Controller
            control={form.control}
            name="accountId"
            render={({ field }) => (
              <SelectField
                id="idea-account"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? "")}
                placeholder="Pick an account"
                options={lists.socialAccounts.filter((a) => a.is_active).map((a) => ({ value: a.id, label: a.name }))}
                invalid={!!errors.accountId}
              />
            )}
          />
        </FormField>
        <FormField label="Title" htmlFor="idea-title" required error={errors.title?.message}>
          <Input id="idea-title" aria-invalid={!!errors.title} {...form.register("title")} />
        </FormField>
        <FormField label="Notes" htmlFor="idea-brief" error={errors.brief?.message}>
          <Textarea id="idea-brief" rows={4} {...form.register("brief")} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Pillar" htmlFor="idea-pillar">
            <Controller
              control={form.control}
              name="pillarId"
              render={({ field }) => (
                <SelectField
                  id="idea-pillar"
                  value={field.value ?? null}
                  onChange={field.onChange}
                  noneLabel="No pillar"
                  options={lists.pillars.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.name }))}
                />
              )}
            />
          </FormField>
          <FormField label="Format" htmlFor="idea-format">
            <Controller
              control={form.control}
              name="format"
              render={({ field }) => (
                <SelectField
                  id="idea-format"
                  value={field.value}
                  onChange={(v) => v && field.onChange(v)}
                  options={POST_FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
                />
              )}
            />
          </FormField>
        </div>
      </form>
    </FormSheet>
  );
}

// ---------- Existing post ------------------------------------------------------------

type Detail = { post: PostItem; comments: PostComment[] };

const MOVE_TOAST: Record<PostMove, string> = {
  start_drafting: "Drafting started",
  submit: "Sent for review",
  approve: "Post approved",
  cancel: "Post cancelled",
};

function OpenPostSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workDirty, setWorkDirty] = useState(false);
  const [version, setVersion] = useState(0);

  const reload = useCallback(async () => {
    const res = await loadPost(id);
    if (res.ok) {
      setDetail(res.data);
      setError(null);
    } else setError(res.error);
  }, [id]);

  useEffect(() => {
    let live = true;
    void loadPost(id).then((res) => {
      if (!live) return;
      if (res.ok) setDetail(res.data);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [id]);

  const refreshAll = async () => {
    await reload();
    setVersion((v) => v + 1);
    router.refresh();
  };

  if (!detail) {
    return (
      <FormSheet open onOpenChange={(o) => !o && onClose()} title={error ? "Post not found" : "Loading post…"}>
        {error ? <p className="text-body text-ink-muted">{error}</p> : <ListSkeleton label="Loading post" rows={5} />}
      </FormSheet>
    );
  }
  return (
    <PostPanel
      key={`${detail.post.id}-${version}`}
      detail={detail}
      onClose={onClose}
      onChanged={refreshAll}
      workDirty={workDirty}
      setWorkDirty={setWorkDirty}
    />
  );
}

function PostPanel({
  detail,
  onClose,
  onChanged,
  workDirty,
  setWorkDirty,
}: {
  detail: Detail;
  onClose: () => void;
  onChanged: () => Promise<void>;
  workDirty: boolean;
  setWorkDirty: (d: boolean) => void;
}) {
  const { post, comments } = detail;
  const { lists } = useApp();
  const profile = useProfile();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"request_changes" | "mark_posted" | "cancel" | "add_results" | null>(null);
  const [workError, setWorkError] = useState<string | null>(null);
  const now = useNow();
  const founder = profile.role === "founder";
  const isAssignee = post.assigneeId === profile.id;
  const account = lists.socialAccounts.find((a) => a.id === post.accountId);
  const assignee = lists.members.find((m) => m.id === post.assigneeId);
  const actions = allowedPostActions({ role: profile.role, isAssignee, status: post.status, needsApproval: post.needsApproval }).filter(
    (a) => a !== "schedule",
  );
  const editWork = canEditWork({ role: profile.role, isAssignee, status: post.status });

  // ----- work form
  const workForm = useForm<PostWorkValues, unknown, z.output<typeof postWorkSchema>>({
    resolver: zodResolver(postWorkSchema),
    defaultValues: {
      id: post.id,
      caption: post.caption ?? "",
      hashtags: post.hashtags ?? "",
      firstComment: post.firstComment ?? "",
      ctaLink: post.ctaLink ?? "",
      mediaLinks: post.mediaLinks.length ? post.mediaLinks : [],
    },
  });
  const dirty = workForm.formState.isDirty;
  useEffect(() => {
    setWorkDirty(dirty);
  }, [dirty, setWorkDirty]);

  /** Saves the work fields; returns false (with errors shown) if it didn't save. */
  const saveWork = async (quiet = false): Promise<boolean> => {
    setWorkError(null);
    const valid = await workForm.trigger();
    if (!valid) return false;
    const res = await savePostWork(workForm.getValues());
    if (!res.ok) {
      applyFieldErrors(workForm.setError, res.fieldErrors);
      setWorkError(res.error);
      return false;
    }
    workForm.reset(workForm.getValues());
    if (post.status === "approved" && res.data.status === "in_review") {
      toast("Saved. The caption changed after approval, so it went back for review.");
    } else if (!quiet) toast.success("Changes saved");
    return true;
  };

  const runMove = (move: PostMove) =>
    startTransition(async () => {
      if (workDirty && editWork && !(await saveWork(true))) return;
      const res = await movePost({ id: post.id, move });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDialog(null);
      await onChanged();
      toast.success(MOVE_TOAST[move]);
    });

  const onAction = (a: PostAction) => {
    switch (a) {
      case "start_drafting":
        return runMove("start_drafting");
      case "submit":
        return runMove("submit");
      case "approve":
        return runMove("approve");
      case "cancel":
        return setDialog("cancel");
      case "request_changes":
        return setDialog("request_changes");
      case "mark_posted":
        return startTransition(async () => {
          if (workDirty && editWork && !(await saveWork(true))) return;
          setDialog("mark_posted");
        });
      case "add_results":
        return setDialog("add_results");
    }
  };

  const primary = actions.find((a) => a !== "cancel");
  const nudgeResults =
    post.status === "posted" &&
    !post.resultsRecordedAt &&
    !!post.postedAt &&
    !!now &&
    now.getTime() - new Date(post.postedAt).getTime() > RESULTS_NUDGE_HOURS * 3_600_000;

  return (
    <>
      <FormSheet
        open
        onOpenChange={(o) => !o && onClose()}
        dirty={workDirty}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span>{post.title}</span>
            <PostStatusChip status={post.status} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            {account && <PlatformChip platform={account.platform} />}
            <span>{account?.name}</span>
            {post.scheduledAt && <span data-testid="post-time">{formatDualZone(post.scheduledAt, post.timezone, profile.timezone)}</span>}
          </span>
        }
        footer={
          actions.length > 0 ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2" data-testid="post-actions">
              <div>
                {actions.includes("cancel") && (
                  <Button variant="ghost" className="text-bad" disabled={pending} onClick={() => onAction("cancel")}>
                    {POST_ACTION_LABELS.cancel}
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {actions
                  .filter((a) => a !== "cancel")
                  .map((a) => (
                    <Button key={a} variant={a === primary ? "default" : "secondary"} disabled={pending} onClick={() => onAction(a)}>
                      {POST_ACTION_LABELS[a]}
                    </Button>
                  ))}
              </div>
            </div>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-6">
          {post.status === "missed" && (
            <p role="status" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">
              This post missed its time. If it went out, mark it as posted with the link; it counts as late.
            </p>
          )}
          {nudgeResults && (
            <p role="status" className="rounded-md bg-warn-soft px-3 py-2 text-small text-warn-ink">
              It&apos;s been 2 days since this went out. Add the results from the platform.
            </p>
          )}

          <Section title="Brief">
            {founder && post.status !== "posted" && post.status !== "cancelled" ? (
              <BriefEditor post={post} onSaved={onChanged} />
            ) : (
              <BriefReadOnly post={post} assigneeName={assignee?.full_name ?? ""} />
            )}
          </Section>

          <Section title="Work">
            <FormError>{workError}</FormError>
            <WorkFields form={workForm} platform={account?.platform ?? null} readOnly={!editWork} />
            {editWork && (
              <div className="mt-3 flex justify-end">
                <Button
                  variant="secondary"
                  disabled={pending || !dirty}
                  onClick={() => startTransition(async () => void ((await saveWork()) && (await onChanged())))}
                >
                  Save changes
                </Button>
              </div>
            )}
          </Section>

          {post.status === "posted" && (
            <Section title="Posted">
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-body">
                <dt className="text-ink-muted">Live post</dt>
                <dd className="min-w-0">
                  {post.postUrl && (
                    <a href={post.postUrl} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-accent-strong hover:underline">
                      <span className="truncate">{post.postUrl}</span> <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                    </a>
                  )}
                </dd>
                <dt className="text-ink-muted">Posted</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  {post.postedAt && formatDualZone(post.postedAt, post.timezone, profile.timezone)}
                  {post.postedAt && post.scheduledAt && isLate(post.scheduledAt, post.postedAt) && <Chip tone="warn">Posted late</Chip>}
                </dd>
                {post.resultsRecordedAt && (
                  <>
                    <dt className="text-ink-muted">Results</dt>
                    <dd className="num" data-testid="post-results">
                      {[
                        ["impressions", post.impressions],
                        ["reactions", post.reactions],
                        ["comments", post.commentsCount],
                        ["shares", post.shares],
                        ["clicks", post.clicks],
                      ]
                        .filter(([, v]) => v !== null)
                        .map(([k, v]) => `${formatNumber(v as number)} ${k}`)
                        .join(", ") || "None recorded"}
                    </dd>
                  </>
                )}
              </dl>
            </Section>
          )}

          <Section title="Review">
            <ReviewThread postId={post.id} comments={comments} onAdded={onChanged} />
          </Section>
        </div>
      </FormSheet>

      {dialog === "request_changes" && <RequestChangesDialog postId={post.id} onClose={() => setDialog(null)} onDone={onChanged} />}
      {dialog === "mark_posted" && <MarkPostedDialog post={post} onClose={() => setDialog(null)} onDone={onChanged} />}
      {dialog === "add_results" && <ResultsDialog post={post} onClose={() => setDialog(null)} onDone={onChanged} />}
      <AlertDialog open={dialog === "cancel"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this post?</AlertDialogTitle>
            <AlertDialogDescription>It stays on the calendar, struck through, and won&apos;t count as missed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep post</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => runMove("cancel")}>
              Cancel post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h3 className="text-small font-medium text-ink-muted">{title}</h3>
      {children}
    </section>
  );
}

function BriefReadOnly({ post, assigneeName }: { post: PostItem; assigneeName: string }) {
  const { lists } = useApp();
  const { timezone } = useProfile();
  const pillar = lists.pillars.find((p) => p.id === post.pillarId)?.name;
  const campaign = lists.campaigns.find((c) => c.id === post.campaignId)?.name;
  const rows: [string, React.ReactNode][] = [
    ["Post time", post.scheduledAt ? formatDualZone(post.scheduledAt, post.timezone, timezone) : "Not scheduled yet"],
    ["Draft due", post.draftDueAt ? formatDualZone(post.draftDueAt, post.timezone, timezone) : "None"],
    ["Assigned to", assigneeName],
    ["Format", FORMAT_LABELS[post.format]],
    ["Pillar", pillar ?? "None"],
    ["Campaign", campaign ?? "None"],
    ["Approval", post.needsApproval ? "Needs the founder's approval" : "No approval needed"],
  ];
  return (
    <div className="flex flex-col gap-3">
      {post.brief ? (
        <p className="whitespace-pre-wrap rounded-md bg-surface-muted px-3 py-2 text-body text-ink">{post.brief}</p>
      ) : (
        <p className="text-body text-ink-muted">No brief. Write it from the title.</p>
      )}
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-body">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function BriefEditor({ post, onSaved }: { post: PostItem; onSaved: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<PostBriefValues, unknown, BriefOutput>({
    resolver: zodResolver(postBriefSchema),
    defaultValues: briefDefaults(post, { accountId: "", assigneeId: "" }),
  });
  const idea = post.status === "idea";
  const submit = form.handleSubmit(() =>
    startTransition(async () => {
      setFormError(null);
      const res = await savePostBrief(form.getValues());
      if (!res.ok) {
        applyFieldErrors(form.setError, res.fieldErrors);
        setFormError(res.error);
        return;
      }
      await onSaved();
      toast.success(idea ? "Post scheduled" : "Brief saved");
    }),
  );
  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={submit} aria-label="Brief">
      <FormError>{formError}</FormError>
      <BriefFields control={form.control} register={form.register} errors={form.formState.errors} idPrefix="post-brief" />
      <div className="flex justify-end">
        <Button type="submit" variant={idea ? "default" : "secondary"} pending={pending} disabled={(!idea && !form.formState.isDirty)}>
          {idea ? "Schedule post" : "Save brief"}
        </Button>
      </div>
    </form>
  );
}

type WorkForm = ReturnType<typeof useForm<PostWorkValues, unknown, z.output<typeof postWorkSchema>>>;

function WorkFields({ form, platform, readOnly }: { form: WorkForm; platform: Parameters<typeof CaptionCounter>[0]["platform"]; readOnly: boolean }) {
  const errors = form.formState.errors;
  const caption = useWatch({ control: form.control, name: "caption" }) ?? "";
  return (
    <div className="flex flex-col gap-4">
      <FormField
        label="Caption"
        htmlFor="post-caption"
        error={errors.caption?.message}
        helper={<CaptionCounter id="post-caption-count" length={caption.length} platform={platform} />}
      >
        <Textarea
          id="post-caption"
          rows={8}
          readOnly={readOnly}
          aria-describedby="post-caption-count"
          aria-invalid={!!errors.caption}
          {...form.register("caption")}
        />
      </FormField>
      <FormField label="Hashtags" htmlFor="post-hashtags" error={errors.hashtags?.message}>
        <Input id="post-hashtags" readOnly={readOnly} placeholder="#dental #ai" {...form.register("hashtags")} />
      </FormField>
      <FormField label="First comment" htmlFor="post-first-comment" error={errors.firstComment?.message}>
        <Textarea id="post-first-comment" rows={2} readOnly={readOnly} {...form.register("firstComment")} />
      </FormField>
      <FormField label="CTA link" htmlFor="post-cta" error={errors.ctaLink?.message}>
        <Input id="post-cta" type="url" readOnly={readOnly} placeholder="https://" aria-invalid={!!errors.ctaLink} {...form.register("ctaLink")} />
      </FormField>
      <FormField
        label="Media links"
        htmlFor="post-media-0"
        error={errors.mediaLinks?.message ?? errors.mediaLinks?.root?.message}
        helper="Google Drive, Canva or Dropbox links. No uploads."
      >
        <Controller
          control={form.control}
          name="mediaLinks"
          render={({ field }) => {
            const links = field.value ?? [];
            return (
              <div className="flex flex-col gap-2">
                {links.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      id={`post-media-${i}`}
                      value={l}
                      readOnly={readOnly}
                      placeholder="https://"
                      aria-label={`Media link ${i + 1}`}
                      onChange={(e) => field.onChange(links.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove media link ${i + 1}`}
                        onClick={() => field.onChange(links.filter((_, j) => j !== i))}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                ))}
                {!readOnly && links.length < MAX_MEDIA_LINKS && (
                  <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => field.onChange([...links, ""])}>
                    <Plus aria-hidden /> Add link
                  </Button>
                )}
                {readOnly && links.length === 0 && <span className="text-body text-ink-muted">None</span>}
              </div>
            );
          }}
        />
      </FormField>
    </div>
  );
}

const KIND_TONE: Record<PostCommentKind, "neutral" | "warn" | "ok" | "muted"> = {
  comment: "neutral",
  change_request: "warn",
  approval: "ok",
  status_note: "muted",
};

function ReviewThread({ postId, comments, onAdded }: { postId: string; comments: PostComment[]; onAdded: () => Promise<void> }) {
  const { lists } = useApp();
  const { timezone } = useProfile();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {comments.length === 0 ? (
        <p className="text-body text-ink-muted">No comments yet.</p>
      ) : (
        <ol className="flex flex-col gap-3" data-testid="review-thread">
          {comments.map((c) => (
            <li key={c.id} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2 text-small">
                <span className="font-medium text-ink">{lists.members.find((m) => m.id === c.authorId)?.full_name ?? "Someone"}</span>
                {c.kind !== "comment" && <Chip tone={KIND_TONE[c.kind]}>{COMMENT_KIND_LABELS[c.kind]}</Chip>}
                <RelativeTime at={c.createdAt} tz={timezone} className="text-ink-muted" />
              </div>
              <p className="whitespace-pre-wrap text-body text-ink">{c.body}</p>
            </li>
          ))}
        </ol>
      )}
      <FormField label="Add a comment" htmlFor="post-comment" error={error}>
        <Textarea id="post-comment" rows={2} value={body} onChange={(e) => setBody(e.target.value)} aria-invalid={!!error} />
      </FormField>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-end"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            if (!body.trim()) {
              setError("Write a comment first.");
              return;
            }
            const res = await addPostComment({ postId, body });
            if (!res.ok) {
              setError(res.fieldErrors?.body ?? res.error);
              return;
            }
            setBody("");
            setError(null);
            await onAdded();
          })
        }
      >
        Add comment
      </Button>
    </div>
  );
}

export function RequestChangesDialog({ postId, onClose, onDone }: { postId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request changes</DialogTitle>
          <DialogDescription>Say what needs to change. It goes back to the writer with your note.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          id="request-changes-form"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              if (!body.trim()) {
                setError("Say what needs to change.");
                return;
              }
              const res = await requestChanges({ postId, body });
              if (!res.ok) {
                setError(res.fieldErrors?.body ?? res.error);
                return;
              }
              onClose();
              await onDone();
              toast.success("Changes requested");
            });
          }}
        >
          <FormField label="What needs to change" htmlFor="changes-body" required error={error}>
            <Textarea id="changes-body" rows={4} autoFocus value={body} onChange={(e) => setBody(e.target.value)} aria-invalid={!!error} />
          </FormField>
        </form>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="request-changes-form" pending={pending}>
            Request changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MarkPostedDialog({ post, onClose, onDone }: { post: PostItem; onClose: () => void; onDone: () => Promise<void> }) {
  const { timezone } = useProfile();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<MarkPostedValues, unknown, z.output<typeof markPostedSchema>>({
    resolver: zodResolver(markPostedSchema),
    defaultValues: { id: post.id, postUrl: "", postedLocal: toLocalDateTimeInput(new Date(), timezone) },
  });
  const errors = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as posted</DialogTitle>
          <DialogDescription>Paste the link to the live post. On time means within an hour of the post time.</DialogDescription>
        </DialogHeader>
        <form
          id="mark-posted-form"
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(() =>
            startTransition(async () => {
              setFormError(null);
              const res = await markPosted(form.getValues());
              if (!res.ok) {
                applyFieldErrors(form.setError, res.fieldErrors);
                setFormError(res.error);
                return;
              }
              onClose();
              await onDone();
              toast.success("Marked as posted");
            }),
          )}
        >
          <FormError>{formError}</FormError>
          <FormField label="Live post link" htmlFor="posted-url" required error={errors.postUrl?.message}>
            <Input id="posted-url" type="url" autoFocus placeholder="https://www.linkedin.com/feed/update/…" aria-invalid={!!errors.postUrl} {...form.register("postUrl")} />
          </FormField>
          <FormField
            label="Posted at (your time)"
            htmlFor="posted-at"
            error={errors.postedLocal?.message}
            helper="Up to 24 hours ago."
          >
            <Input id="posted-at" type="datetime-local" aria-invalid={!!errors.postedLocal} {...form.register("postedLocal")} />
          </FormField>
        </form>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="mark-posted-form" pending={pending}>
            Mark as posted
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const RESULT_FIELDS = [
  ["impressions", "Impressions"],
  ["reactions", "Reactions"],
  ["commentsCount", "Comments"],
  ["shares", "Shares"],
  ["clicks", "Clicks"],
] as const;

function ResultsDialog({ post, onClose, onDone }: { post: PostItem; onClose: () => void; onDone: () => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ResultsValues, unknown, z.output<typeof resultsSchema>>({
    resolver: zodResolver(resultsSchema),
    defaultValues: {
      id: post.id,
      impressions: post.impressions?.toString() ?? "",
      reactions: post.reactions?.toString() ?? "",
      commentsCount: post.commentsCount?.toString() ?? "",
      shares: post.shares?.toString() ?? "",
      clicks: post.clicks?.toString() ?? "",
    },
  });
  const errors = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add results</DialogTitle>
          <DialogDescription>Copy the numbers from the platform. Leave a box empty if it doesn&apos;t show that number.</DialogDescription>
        </DialogHeader>
        <form
          id="results-form"
          noValidate
          className="grid grid-cols-2 gap-4 sm:grid-cols-3"
          onSubmit={form.handleSubmit(() =>
            startTransition(async () => {
              setFormError(null);
              const res = await saveResults(form.getValues());
              if (!res.ok) {
                applyFieldErrors(form.setError, res.fieldErrors);
                setFormError(res.error);
                return;
              }
              onClose();
              await onDone();
              toast.success("Results saved");
            }),
          )}
        >
          {formError && (
            <div className="col-span-full">
              <FormError>{formError}</FormError>
            </div>
          )}
          {RESULT_FIELDS.map(([name, label]) => (
            <FormField key={name} label={label} htmlFor={`result-${name}`} error={errors[name]?.message}>
              <Input id={`result-${name}`} inputMode="numeric" className={cn("num")} aria-invalid={!!errors[name]} {...form.register(name)} />
            </FormField>
          ))}
        </form>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="results-form" pending={pending}>
            Save results
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
