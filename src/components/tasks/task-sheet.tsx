"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "@/components/app/nav-progress";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormField } from "@/components/common/form-field";
import { FormSheet } from "@/components/common/form-sheet";
import { SelectField } from "@/components/common/select-field";
import { useApp } from "@/components/app/app-provider";
import { METRIC_LABELS, SALES_TASK_METRICS } from "@/lib/domain";
import { applyFieldErrors } from "@/lib/forms";
import { COMMON_TASKS, countTaskTitle, taskFormSchema, type TaskData, type TaskFormValues } from "@/lib/validation/task";
import { createTask, searchLinkTargets, updateTask, updateTemplate, type LinkOption } from "@/server/actions/tasks";

const SOCIAL_TASK_METRICS = ["posts_published"] as const;

export type TaskSheetState =
  | { mode: "new"; defaults?: Partial<TaskFormValues> }
  | { mode: "edit"; values: TaskFormValues; linkLabel?: string | null }
  | { mode: "template"; values: TaskFormValues };

/** New task (T) side panel (docs/07 section 8). Also edits a task or a repeating template. */
export function TaskSheet({ state, onClose, defaultDate }: { state: TaskSheetState; onClose: () => void; defaultDate: string }) {
  const { lists } = useApp();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [titleTouched, setTitleTouched] = useState(state.mode !== "new");

  const base: TaskFormValues = {
    assigneeId: "",
    kind: "count",
    title: "",
    metric: "leads_added",
    targetCount: "",
    filterNicheId: null,
    filterCampaignId: null,
    leadId: null,
    opportunityId: null,
    note: "",
    dueDate: defaultDate,
    repeat: false,
  };
  const initial = state.mode === "new" ? { ...base, ...state.defaults } : state.values;
  const form = useForm<TaskFormValues, unknown, TaskData>({ resolver: zodResolver(taskFormSchema), defaultValues: initial });
  const { control, register, setValue, formState, reset } = form;
  const errors = formState.errors;
  const kind = useWatch({ control, name: "kind" });
  const metric = useWatch({ control, name: "metric" });
  const target = useWatch({ control, name: "targetCount" });
  const assigneeId = useWatch({ control, name: "assigneeId" });
  const repeat = useWatch({ control, name: "repeat" });

  // Title auto-fills for count tasks until the founder types their own.
  useEffect(() => {
    if (kind === "count" && !titleTouched) setValue("title", countTaskTitle(metric, target));
  }, [kind, metric, target, setValue, titleTouched]);

  const members = lists.members.filter((m) => m.is_active);
  // Social media managers count posts; everyone else counts sales work (docs/09 section 1).
  const assigneeIsSmm = lists.members.find((m) => m.id === assigneeId)?.role === "social";
  const metricOptions = assigneeIsSmm ? SOCIAL_TASK_METRICS : SALES_TASK_METRICS;
  useEffect(() => {
    if (kind !== "count" || !metric) return;
    const ok = (metricOptions as readonly string[]).includes(metric);
    if (!ok) setValue("metric", metricOptions[0]!);
  }, [kind, metric, metricOptions, setValue]);
  const editingOne = state.mode !== "new";
  const [linkLabel, setLinkLabel] = useState<string | null>(state.mode === "edit" ? (state.linkLabel ?? null) : null);

  const submit = form.handleSubmit(() =>
    startTransition(async () => {
      setFormError(null);
      const values = form.getValues();
      const res =
        state.mode === "template" ? await updateTemplate(values) : state.mode === "edit" ? await updateTask(values) : await createTask(values);
      if (!res.ok) {
        applyFieldErrors(form.setError, res.fieldErrors);
        setFormError(res.error);
        return;
      }
      toast.success(state.mode === "new" ? "Task assigned" : "Task saved");
      router.refresh();
      onClose();
    }),
  );

  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={state.mode === "new" ? "New task" : state.mode === "template" ? "Edit repeating task" : "Edit task"}
      description={state.mode === "template" ? "Changes apply to future days. Tasks already created stay as they are." : undefined}
      dirty={formState.isDirty}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="task-form" pending={pending}>
            {state.mode === "new" ? "Assign task" : "Save task"}
          </Button>
        </div>
      }
    >
      <form id="task-form" noValidate className="flex flex-col gap-4" onSubmit={submit}>
        {state.mode === "new" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="secondary" className="self-start">
                Start from a common task <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {COMMON_TASKS.map((c) => (
                <DropdownMenuItem
                  key={c.key}
                  onSelect={() => {
                    setTitleTouched(c.values.kind === "checklist");
                    reset({ ...base, assigneeId: form.getValues("assigneeId"), ...c.values }, { keepDefaultValues: true });
                    if (c.values.kind === "count") setValue("title", countTaskTitle(c.values.metric ?? null, c.values.targetCount ?? null), { shouldDirty: true });
                  }}
                >
                  {c.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {formError && (
          <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">
            {formError}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Assign to" htmlFor="task-assignee" required error={errors.assigneeId?.message}>
            <Controller
              control={control}
              name="assigneeId"
              render={({ field }) => (
                <SelectField
                  id="task-assignee"
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? "")}
                  placeholder="Pick a person"
                  options={members.map((m) => ({ value: m.id, label: m.full_name || m.email }))}
                  invalid={!!errors.assigneeId}
                />
              )}
            />
          </FormField>
          <FormField label="Kind" htmlFor="task-kind">
            <Controller
              control={control}
              name="kind"
              render={({ field }) => (
                <SelectField
                  id="task-kind"
                  value={field.value}
                  disabled={editingOne}
                  onChange={(v) => v && field.onChange(v)}
                  options={[
                    { value: "count", label: "Count" },
                    { value: "checklist", label: "Checklist" },
                  ]}
                />
              )}
            />
          </FormField>
        </div>

        {kind === "count" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Metric" htmlFor="task-metric" required error={errors.metric?.message}>
              <Controller
                control={control}
                name="metric"
                render={({ field }) => (
                  <SelectField
                    id="task-metric"
                    value={field.value ?? null}
                    onChange={field.onChange}
                    placeholder="Pick what to count"
                    options={metricOptions.map((m) => ({ value: m, label: METRIC_LABELS[m] }))}
                  />
                )}
              />
            </FormField>
            <FormField label="Target" htmlFor="task-target" required error={errors.targetCount?.message}>
              <Input id="task-target" inputMode="numeric" className="num" aria-invalid={!!errors.targetCount} {...register("targetCount")} />
            </FormField>
            <FormField label="Only count niche" htmlFor="task-niche">
              <Controller
                control={control}
                name="filterNicheId"
                render={({ field }) => (
                  <SelectField id="task-niche" value={field.value ?? null} onChange={field.onChange} noneLabel="Any niche" options={lists.niches.filter((n) => n.is_active || n.id === field.value).map((n) => ({ value: n.id, label: n.name }))} />
                )}
              />
            </FormField>
            <FormField label="Only count campaign" htmlFor="task-campaign">
              <Controller
                control={control}
                name="filterCampaignId"
                render={({ field }) => (
                  <SelectField
                    id="task-campaign"
                    value={field.value ?? null}
                    onChange={field.onChange}
                    noneLabel="Any campaign"
                    options={lists.campaigns.filter((c) => c.status === "active" || c.id === field.value).map((c) => ({ value: c.id, label: c.name }))}
                  />
                )}
              />
            </FormField>
          </div>
        )}

        <FormField label="Title" htmlFor="task-title" required error={errors.title?.message} helper={kind === "count" ? "Filled in from the metric and target. You can change it." : undefined}>
          <Input
            id="task-title"
            aria-invalid={!!errors.title}
            {...register("title", {
              onChange: () => setTitleTouched(true),
            })}
          />
        </FormField>

        {kind === "checklist" && state.mode !== "template" && (
          <FormField label="Linked lead or opportunity" htmlFor="task-link" helper="Optional. Search by company or opportunity title.">
            <LinkPicker
              assigneeId={assigneeId || null}
              label={linkLabel}
              onPick={(opt) => {
                setLinkLabel(opt?.label ?? null);
                setValue("leadId", opt?.kind === "lead" ? opt.id : null, { shouldDirty: true });
                setValue("opportunityId", opt?.kind === "opportunity" ? opt.id : null, { shouldDirty: true });
              }}
            />
          </FormField>
        )}

        <FormField label="Note" htmlFor="task-note" error={errors.note?.message}>
          <Textarea id="task-note" rows={3} {...register("note")} />
        </FormField>

        {state.mode !== "template" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Due date" htmlFor="task-due" required error={errors.dueDate?.message} helper={repeat ? "First day it repeats." : undefined}>
              <Input id="task-due" type="date" aria-invalid={!!errors.dueDate} {...register("dueDate")} />
            </FormField>
            {state.mode === "new" && (
              <div className="flex items-end pb-2">
                <Controller
                  control={control}
                  name="repeat"
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Switch id="task-repeat" checked={!!field.value} onCheckedChange={field.onChange} />
                      <Label htmlFor="task-repeat" className="text-body">
                        Repeat on weekdays
                      </Label>
                    </div>
                  )}
                />
              </div>
            )}
          </div>
        )}
      </form>
    </FormSheet>
  );
}

function LinkPicker({ assigneeId, label, onPick }: { assigneeId: string | null; label: string | null; onPick: (o: LinkOption | null) => void }) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<LinkOption[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      void searchLinkTargets({ q, assigneeId }).then((r) => live && r.ok && setOptions(r.data));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, assigneeId]);

  if (label) {
    return (
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate rounded-md border border-line bg-surface-muted px-3 py-1.5 text-body">{label}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onPick(null)}>
          Remove link
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <Input id="task-link" value={q} placeholder="Search leads and opportunities" onChange={(e) => setQ(e.target.value)} />
      {q.trim().length >= 2 && options.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-md border border-line bg-surface" role="listbox" aria-label="Matches">
          {options.map((o) => (
            <li key={`${o.kind}-${o.id}`}>
              <button type="button" role="option" aria-selected={false} className="w-full px-3 py-1.5 text-left text-body hover:bg-surface-muted" onClick={() => onPick(o)}>
                {o.label}
                <span className="ml-2 text-small text-ink-muted">{o.kind === "lead" ? "Lead" : "Opportunity"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
