"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/components/app/nav-progress";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { RelativeTime } from "@/components/common/relative-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Chip, StageChip } from "@/components/common/chips";
import { FormField } from "@/components/common/form-field";
import { Panel, PanelHeader } from "@/components/common/page";
import { SelectField } from "@/components/common/select-field";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { useNow } from "@/lib/use-now";
import type { Tables } from "@/lib/domain";
import { MAX_BACKDATE_DAYS, toLocalDateTimeInput } from "@/lib/dates";
import { contactName, initials } from "@/lib/format";
import { applyFieldErrors } from "@/lib/forms";
import { BD_EDIT_WINDOW_MS, editActivityFields, outcomesFor, type EditActivityValues } from "@/lib/validation/activity";
import { deleteActivity, updateActivity } from "@/server/actions/activities";

type Item =
  | { kind: "activity"; at: string; a: Tables<"activities"> }
  | { kind: "stage"; at: string; e: Tables<"opportunity_stage_events"> }
  | { kind: "owner"; at: string; e: Tables<"lead_owner_events"> }
  | { kind: "created"; at: string };

type Filter = "all" | "activities" | "pipeline";

const OUTCOME_TONE: Record<string, "neutral" | "accent" | "ok" | "warn" | "bad" | "muted"> = {
  no_response: "neutral",
  bounced: "bad",
  interested: "accent",
  not_now: "warn",
  not_interested: "muted",
  meeting_booked: "ok",
  done: "neutral",
};

/** Activities, stage changes, owner changes and lead creation, newest first (docs/07 section 5). */
export function Timeline({
  lead,
  activities,
  stageEvents,
  ownerEvents,
  opportunities,
  contacts,
}: {
  lead: Tables<"leads">;
  activities: Tables<"activities">[];
  stageEvents: Tables<"opportunity_stage_events">[];
  ownerEvents: Tables<"lead_owner_events">[];
  opportunities: Tables<"opportunities">[];
  contacts: Tables<"contacts">[];
}) {
  const { lists } = useApp();
  const profile = useProfile();
  const router = useRouter();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Tables<"activities"> | null>(null);
  const [, startTransition] = useTransition();
  const member = (id: string | null) => lists.members.find((m) => m.id === id)?.full_name || "Someone";
  const typeName = (id: string) => lists.activityTypes.find((t) => t.id === id)?.name ?? "Activity";
  const outcomeLabel = (k: string) => lists.outcomes.find((o) => o.key === k)?.label ?? k;
  const stageLabel = (k: string | null) => lists.stages.find((s) => s.key === k)?.label ?? k ?? "";
  const oppTitle = (id: string) => opportunities.find((o) => o.id === id)?.title ?? "Opportunity";
  const contact = (id: string | null) => {
    const c = contacts.find((x) => x.id === id);
    return c ? contactName(c) : null;
  };

  const items: Item[] = [
    ...activities.map((a) => ({ kind: "activity" as const, at: a.occurred_at, a })),
    ...stageEvents.map((e) => ({ kind: "stage" as const, at: e.changed_at, e })),
    // the first owner event is the creation itself
    ...ownerEvents.filter((e) => e.from_owner).map((e) => ({ kind: "owner" as const, at: e.changed_at, e })),
    { kind: "created" as const, at: lead.created_at },
  ].sort((x, y) => y.at.localeCompare(x.at));

  const shown = items.filter((i) =>
    filter === "all" ? true : filter === "activities" ? i.kind === "activity" : i.kind === "stage" || i.kind === "owner",
  );

  const canEdit = (a: Tables<"activities">) =>
    profile.role === "founder" ||
    (a.user_id === profile.id && !!now && now.getTime() - new Date(a.created_at).getTime() < BD_EDIT_WINDOW_MS);

  return (
    <Panel>
      <PanelHeader
        title="Timeline"
        actions={
          <div role="group" aria-label="Show" className="flex gap-1">
            {(["all", "activities", "pipeline"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "h-7 rounded-md px-2.5 text-small",
                  filter === f ? "bg-accent-soft font-medium text-accent-strong" : "text-ink-muted hover:bg-surface-muted",
                )}
              >
                {f === "all" ? "All" : f === "activities" ? "Activities" : "Pipeline"}
              </button>
            ))}
          </div>
        }
      />
      <ol className="divide-y divide-line" data-testid="timeline">
        {shown.map((i) => {
          const time = <RelativeTime at={i.at} tz={profile.timezone} className="num w-32 shrink-0 text-small text-ink-muted" />;
          if (i.kind === "activity") {
            const a = i.a;
            const who = contact(a.contact_id);
            return (
              <li key={`a-${a.id}`} className="flex gap-3 px-4 py-3" data-testid="timeline-activity">
                {time}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{typeName(a.activity_type_id)}</span>
                    <Chip tone={OUTCOME_TONE[a.outcome_key] ?? "neutral"}>{outcomeLabel(a.outcome_key)}</Chip>
                    {who && <span className="text-small text-ink-muted">with {who}</span>}
                  </div>
                  {a.notes && <p className="mt-1 text-body whitespace-pre-line text-ink-muted">&ldquo;{a.notes}&rdquo;</p>}
                </div>
                <span className="num text-micro text-ink-muted" title={member(a.user_id)}>
                  {initials(member(a.user_id))}
                </span>
                {canEdit(a) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${typeName(a.activity_type_id)}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(a)}>Edit</DropdownMenuItem>
                      {profile.role === "founder" && (
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() =>
                            startTransition(async () => {
                              const res = await deleteActivity({ id: a.id });
                              if (!res.ok) toast.error(res.error);
                              else {
                                toast.success("Activity deleted");
                                router.refresh();
                              }
                            })
                          }
                        >
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          }
          if (i.kind === "stage") {
            const e = i.e;
            return (
              <li key={`s-${e.id}`} className="flex gap-3 px-4 py-3" data-testid="timeline-stage">
                {time}
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className="text-ink">{oppTitle(e.opportunity_id)}</span>
                  {e.from_stage ? (
                    <>
                      <StageChip stage={e.from_stage} label={stageLabel(e.from_stage)} />
                      <span className="text-small text-ink-muted">to</span>
                    </>
                  ) : (
                    <span className="text-small text-ink-muted">created in</span>
                  )}
                  <StageChip stage={e.to_stage} label={stageLabel(e.to_stage)} />
                </div>
                <span className="num text-micro text-ink-muted" title={member(e.changed_by)}>
                  {initials(member(e.changed_by))}
                </span>
              </li>
            );
          }
          if (i.kind === "owner") {
            return (
              <li key={`o-${i.e.id}`} className="flex gap-3 px-4 py-3">
                {time}
                <span className="flex-1 text-ink">
                  Reassigned from {member(i.e.from_owner)} to {member(i.e.to_owner)}
                </span>
              </li>
            );
          }
          return (
            <li key="created" className="flex gap-3 px-4 py-3">
              {time}
              <span className="flex-1 text-ink">Lead added by {member(lead.created_by)}</span>
            </li>
          );
        })}
      </ol>
      {editing && <EditActivityDialog activity={editing} onClose={() => setEditing(null)} />}
    </Panel>
  );
}

function EditActivityDialog({ activity, onClose }: { activity: Tables<"activities">; onClose: () => void }) {
  const { lists } = useApp();
  const { timezone, role } = useProfile();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<EditActivityValues, unknown, z.output<typeof editActivityFields>>({
    resolver: zodResolver(editActivityFields),
    defaultValues: {
      id: activity.id,
      outcomeKey: activity.outcome_key,
      occurredAt: toLocalDateTimeInput(activity.occurred_at, timezone),
      notes: activity.notes ?? "",
    },
  });
  const errors = form.formState.errors;
  // BDs can backdate up to 7 days; the founder can edit any activity any time (docs/04 section 3).
  const [bounds] = useState(() => ({
    min: role === "founder" ? undefined : toLocalDateTimeInput(new Date(Date.now() - MAX_BACKDATE_DAYS * 86_400_000), timezone),
    max: toLocalDateTimeInput(new Date(), timezone),
  }));
  const allowed = outcomesFor(activity.category, lists.outcomes);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit activity</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(() =>
            startTransition(async () => {
              setFormError(null);
              const res = await updateActivity(form.getValues());
              if (!res.ok) {
                applyFieldErrors(form.setError, res.fieldErrors);
                if (!res.fieldErrors) setFormError(res.error);
                return;
              }
              toast.success("Activity saved");
              onClose();
              router.refresh();
            }),
          )}
        >
          {formError && (
            <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">
              {formError}
            </p>
          )}
          <FormField label="Outcome" htmlFor="edit-outcome" error={errors.outcomeKey?.message}>
            <Controller
              control={form.control}
              name="outcomeKey"
              render={({ field }) => (
                <SelectField
                  id="edit-outcome"
                  value={field.value}
                  onChange={(v) => v && field.onChange(v)}
                  options={allowed.map((o) => ({ value: o.key, label: lists.outcomes.find((x) => x.key === o.key)?.label ?? o.key }))}
                  invalid={!!errors.outcomeKey}
                />
              )}
            />
          </FormField>
          <FormField label="When" htmlFor="edit-when" error={errors.occurredAt?.message}>
            <Input
              id="edit-when"
              type="datetime-local"
              min={bounds.min}
              max={bounds.max}
              aria-invalid={!!errors.occurredAt}
              {...form.register("occurredAt")}
            />
          </FormField>
          <FormField label="Notes" htmlFor="edit-notes" error={errors.notes?.message}>
            <Textarea id="edit-notes" rows={3} aria-invalid={!!errors.notes} {...form.register("notes")} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Save activity
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
