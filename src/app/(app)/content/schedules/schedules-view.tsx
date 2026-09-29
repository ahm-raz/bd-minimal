"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { EmptyState } from "@/components/common/empty-state";
import { FormField } from "@/components/common/form-field";
import { FormSheet } from "@/components/common/form-sheet";
import { PageHeader, Panel } from "@/components/common/page";
import { SelectField } from "@/components/common/select-field";
import { TimezoneSelect } from "@/components/common/timezone-select";
import { PlatformChip } from "@/components/content/post-status-chip";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { applyFieldErrors } from "@/lib/forms";
import { formatDualZone, todayIn, zoneCity } from "@/lib/dates";
import { FORMAT_LABELS, nextSlots, POST_FORMATS } from "@/lib/social";
import { scheduleSchema, WEEKDAYS, WEEKDAY_SHORT, type ScheduleValues } from "@/lib/validation/social";
import { saveSchedule, stopSchedule } from "@/server/actions/schedules";
import type { ScheduleItem } from "@/server/queries/content";

/** 13:00 → "1:00 PM". */
function clock(t: string) {
  const [h, m] = t.split(":").map(Number) as [number, number];
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function SchedulesView({ schedules }: { schedules: ScheduleItem[] }) {
  const { lists } = useApp();
  const router = useRouter();
  const [editing, setEditing] = useState<ScheduleItem | "new" | null>(null);
  const [stopping, setStopping] = useState<ScheduleItem | null>(null);
  const [pending, startTransition] = useTransition();
  const account = (id: string) => lists.socialAccounts.find((a) => a.id === id);
  const person = (id: string) => lists.members.find((m) => m.id === id)?.full_name ?? "";

  return (
    <>
      <PageHeader
        title="Posting schedules"
        meta={
          <Link href="/content" className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden /> Content
          </Link>
        }
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus aria-hidden /> New schedule
          </Button>
        }
      />
      <p className="prose-width mb-4 text-small text-ink-muted">
        Each schedule creates a planned post on its days, up to 4 weeks ahead. Editing a schedule changes future posts that
        haven&apos;t been started. Stopping it cancels its future planned posts.
      </p>
      <Panel className="overflow-hidden">
        {schedules.length === 0 ? (
          <EmptyState action={<Button onClick={() => setEditing("new")}>New schedule</Button>}>
            No schedules yet. Add one, like &ldquo;LinkedIn page, Mon, Wed, Fri at 9:00 AM New York&rdquo;.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body" data-testid="schedules-table">
              <thead className="bg-surface-muted">
                <tr className="border-b border-line text-left text-small text-ink-muted">
                  {["Account", "Assigned to", "Days", "Time", "Pillar", "Format", "Approval", "Status", ""].map((h, i) => (
                    <th key={i} scope="col" className="h-9 px-3 font-medium whitespace-nowrap">
                      {h || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => {
                  const a = account(s.accountId);
                  return (
                    <tr key={s.id} className={cn("h-10 border-b border-line last:border-0", !s.isActive && "text-ink-muted")}>
                      <td className="px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {a && <PlatformChip platform={a.platform} />} {a?.name}
                        </span>
                      </td>
                      <td className="px-3 whitespace-nowrap">{person(s.assigneeId)}</td>
                      <td className="px-3 whitespace-nowrap">{s.weekdays.map((d) => WEEKDAY_SHORT[d]).join(", ")}</td>
                      <td className="num px-3 whitespace-nowrap">
                        {clock(s.localTime)} {zoneCity(s.timezone)}
                      </td>
                      <td className="px-3 whitespace-nowrap">{lists.pillars.find((p) => p.id === s.pillarId)?.name ?? "Open topic"}</td>
                      <td className="px-3 whitespace-nowrap">{FORMAT_LABELS[s.defaultFormat]}</td>
                      <td className="px-3 whitespace-nowrap">{s.needsApproval ? "Needs approval" : "No approval"}</td>
                      <td className="px-3">{s.isActive ? <Chip tone="ok">Active</Chip> : <Chip tone="muted">Stopped</Chip>}</td>
                      <td className="px-3 text-right whitespace-nowrap">
                        {s.isActive && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
                              Edit
                            </Button>
                            <Button variant="ghost" size="sm" className="text-bad" onClick={() => setStopping(s)}>
                              Stop schedule
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editing && <ScheduleSheet key={editing === "new" ? "new" : editing.id} schedule={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}

      <AlertDialog open={!!stopping} onOpenChange={(o) => !o && setStopping(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop this schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              No new posts are created, and its future planned posts are cancelled. Posts already being written stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep schedule</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => {
                const s = stopping;
                if (!s) return;
                startTransition(async () => {
                  const res = await stopSchedule(s.id);
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("Schedule stopped");
                  setStopping(null);
                  router.refresh();
                });
              }}
            >
              Stop schedule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ScheduleSheet({ schedule, onClose }: { schedule: ScheduleItem | null; onClose: () => void }) {
  const { lists } = useApp();
  const profile = useProfile();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const firstAccount = lists.socialAccounts.find((a) => a.is_active);
  const assignees = lists.members.filter((m) => m.is_active && m.role !== "bd");
  const form = useForm<ScheduleValues, unknown, z.output<typeof scheduleSchema>>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: schedule
      ? {
          id: schedule.id,
          accountId: schedule.accountId,
          assigneeId: schedule.assigneeId,
          weekdays: schedule.weekdays,
          localTime: schedule.localTime,
          timezone: schedule.timezone,
          pillarId: schedule.pillarId,
          defaultFormat: schedule.defaultFormat,
          needsApproval: schedule.needsApproval,
          draftLeadHours: String(schedule.draftLeadHours),
          startsOn: schedule.startsOn,
          endsOn: schedule.endsOn,
        }
      : {
          accountId: firstAccount?.id ?? "",
          assigneeId: assignees.find((m) => m.role === "social")?.id ?? "",
          weekdays: [1, 3, 5],
          localTime: "09:00",
          timezone: firstAccount?.audience_timezone ?? "America/New_York",
          pillarId: null,
          defaultFormat: "text",
          needsApproval: true,
          draftLeadHours: "24",
          startsOn: todayIn(profile.timezone),
          endsOn: null,
        },
  });
  const errors = form.formState.errors;
  const [weekdays, localTime, timezone, startsOn, endsOn] = useWatch({
    control: form.control,
    name: ["weekdays", "localTime", "timezone", "startsOn", "endsOn"],
  });
  const preview = nextSlots({ weekdays: weekdays ?? [], localTime: localTime ?? "", timezone: timezone ?? "", startsOn: startsOn ?? "", endsOn: endsOn || null });

  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={schedule ? "Edit schedule" : "New schedule"}
      description={schedule ? "Changes apply to future posts that haven't been started." : undefined}
      dirty={form.formState.isDirty}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="schedule-form" pending={pending}>
            {schedule ? "Save schedule" : "Create schedule"}
          </Button>
        </div>
      }
    >
      <form
        id="schedule-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(() =>
          startTransition(async () => {
            setFormError(null);
            const res = await saveSchedule(form.getValues());
            if (!res.ok) {
              applyFieldErrors(form.setError, res.fieldErrors);
              setFormError(res.error);
              return;
            }
            toast.success(schedule ? "Schedule saved" : "Schedule created");
            router.refresh();
            onClose();
          }),
        )}
      >
        {formError && (
          <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">
            {formError}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Account" htmlFor="sch-account" required error={errors.accountId?.message}>
            <Controller
              control={form.control}
              name="accountId"
              render={({ field }) => (
                <SelectField
                  id="sch-account"
                  value={field.value || null}
                  onChange={(v) => {
                    field.onChange(v ?? "");
                    const tz = lists.socialAccounts.find((a) => a.id === v)?.audience_timezone;
                    if (tz && !schedule) form.setValue("timezone", tz);
                  }}
                  placeholder="Pick an account"
                  options={lists.socialAccounts.filter((a) => a.is_active || a.id === field.value).map((a) => ({ value: a.id, label: a.name }))}
                  invalid={!!errors.accountId}
                />
              )}
            />
          </FormField>
          <FormField label="Assigned to" htmlFor="sch-assignee" required error={errors.assigneeId?.message}>
            <Controller
              control={form.control}
              name="assigneeId"
              render={({ field }) => (
                <SelectField
                  id="sch-assignee"
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
        <FormField label="Days" htmlFor="sch-day-1" required error={errors.weekdays?.message}>
          <Controller
            control={form.control}
            name="weekdays"
            render={({ field }) => (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
                {WEEKDAYS.map((d) => {
                  const on = field.value.includes(d);
                  return (
                    <button
                      key={d}
                      id={`sch-day-${d}`}
                      type="button"
                      aria-pressed={on}
                      onClick={() => field.onChange(on ? field.value.filter((x) => x !== d) : [...field.value, d].sort())}
                      className={cn(
                        "h-8 w-12 rounded-md border text-body transition-colors",
                        on ? "border-accent-strong bg-accent-soft font-medium text-accent-strong" : "border-line bg-surface text-ink hover:bg-surface-muted",
                      )}
                    >
                      {WEEKDAY_SHORT[d]}
                    </button>
                  );
                })}
              </div>
            )}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Time" htmlFor="sch-time" required error={errors.localTime?.message}>
            <Input id="sch-time" type="time" aria-invalid={!!errors.localTime} {...form.register("localTime")} />
          </FormField>
          <FormField label="Time zone" htmlFor="sch-tz" required error={errors.timezone?.message} helper="Where the audience lives.">
            <Controller
              control={form.control}
              name="timezone"
              render={({ field }) => <TimezoneSelect id="sch-tz" value={field.value} onChange={field.onChange} />}
            />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Pillar" htmlFor="sch-pillar">
            <Controller
              control={form.control}
              name="pillarId"
              render={({ field }) => (
                <SelectField
                  id="sch-pillar"
                  value={field.value ?? null}
                  onChange={field.onChange}
                  noneLabel="Open topic"
                  options={lists.pillars.filter((p) => p.is_active || p.id === field.value).map((p) => ({ value: p.id, label: p.name }))}
                />
              )}
            />
          </FormField>
          <FormField label="Format" htmlFor="sch-format">
            <Controller
              control={form.control}
              name="defaultFormat"
              render={({ field }) => (
                <SelectField
                  id="sch-format"
                  value={field.value}
                  onChange={(v) => v && field.onChange(v)}
                  options={POST_FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
                />
              )}
            />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Draft due (hours before)" htmlFor="sch-lead" required error={errors.draftLeadHours?.message}>
            <Input id="sch-lead" inputMode="numeric" className="num" aria-invalid={!!errors.draftLeadHours} {...form.register("draftLeadHours")} />
          </FormField>
          <FormField label="Starts" htmlFor="sch-start" required error={errors.startsOn?.message}>
            <Input id="sch-start" type="date" aria-invalid={!!errors.startsOn} {...form.register("startsOn")} />
          </FormField>
          <FormField label="Ends" htmlFor="sch-end" error={errors.endsOn?.message} helper="Optional.">
            <Input id="sch-end" type="date" aria-invalid={!!errors.endsOn} {...form.register("endsOn")} />
          </FormField>
        </div>
        <Controller
          control={form.control}
          name="needsApproval"
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Switch id="sch-approval" checked={field.value} onCheckedChange={field.onChange} />
              <Label htmlFor="sch-approval" className="text-body">
                Posts need your approval
              </Label>
            </div>
          )}
        />
        <div className="rounded-md bg-surface-muted px-3 py-2" data-testid="schedule-preview">
          <div className="text-small font-medium text-ink">Next 3 posts</div>
          {preview.length === 0 ? (
            <p className="text-small text-ink-muted">Pick at least one day and a time.</p>
          ) : (
            <ul className="num mt-1 flex flex-col gap-0.5 text-small text-ink">
              {preview.map((d) => (
                <li key={d.toISOString()}>{formatDualZone(d, timezone, profile.timezone)}</li>
              ))}
            </ul>
          )}
        </div>
      </form>
    </FormSheet>
  );
}
