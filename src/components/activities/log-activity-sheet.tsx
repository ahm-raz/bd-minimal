"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DueDateChips } from "@/components/common/due-date-chips";
import { FormField } from "@/components/common/form-field";
import { FormSheet } from "@/components/common/form-sheet";
import { SelectField } from "@/components/common/select-field";
import { StatusChip } from "@/components/common/chips";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { ACTIVITY_CATEGORIES, CATEGORY_LABELS, type ActivityCategory } from "@/lib/domain";
import { MAX_BACKDATE_DAYS, toLocalDateTimeInput } from "@/lib/dates";
import { applyFieldErrors } from "@/lib/forms";
import {
  defaultOutcome,
  makeLogActivitySchema,
  MEETING_OUTCOME,
  NO_NEXT_ACTION_OUTCOMES,
  outcomesFor,
  type LogActivityData,
  type LogActivityValues,
} from "@/lib/validation/activity";
import { getLeadForLog, logActivity, type LeadForLog, type LogActivityResult } from "@/server/actions/activities";
import { MeetingFields, type MeetingErrors } from "@/components/meetings/meeting-fields";
import { CreateOpportunityDialog, ProposalMoveDialog } from "./opportunity-prompts";

/** Global Log activity side panel (docs/07 section 6). */
export function LogActivitySheet() {
  const { logSheet, closeLogActivity } = useApp();
  const [prompt, setPrompt] = useState<{ lead: LeadForLog; result: LogActivityResult } | null>(null);
  return (
    <>
      {logSheet && (
        <LogActivityLoader
          key={`${logSheet.leadId}-${logSheet.contactId ?? ""}`}
          leadId={logSheet.leadId}
          contactId={logSheet.contactId ?? null}
          onClose={closeLogActivity}
          onLogged={(lead, result) => {
            closeLogActivity();
            if (result.offerOpportunity || result.offerProposalMove) setPrompt({ lead, result });
          }}
        />
      )}
      {prompt?.result.offerOpportunity && (
        <CreateOpportunityDialog leadId={prompt.lead.id} companyName={prompt.lead.company_name} onClose={() => setPrompt(null)} />
      )}
      {prompt?.result.offerProposalMove && (
        <ProposalMoveDialog opportunity={prompt.result.offerProposalMove} onClose={() => setPrompt(null)} />
      )}
    </>
  );
}

function LogActivityLoader({
  leadId,
  contactId,
  onClose,
  onLogged,
}: {
  leadId: string;
  contactId: string | null;
  onClose: () => void;
  onLogged: (lead: LeadForLog, result: LogActivityResult) => void;
}) {
  const [lead, setLead] = useState<LeadForLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void getLeadForLog(leadId).then((res) => {
      if (!live) return;
      if (res.ok) setLead(res.data);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [leadId]);

  if (!lead) {
    return (
      <FormSheet open onOpenChange={(o) => !o && onClose()} title="Log activity">
        {error ? (
          <p role="alert" className="text-body text-bad">
            {error}
          </p>
        ) : (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}
      </FormSheet>
    );
  }
  return <LogActivityForm lead={lead} contactId={contactId} onClose={onClose} onLogged={onLogged} />;
}

function LogActivityForm({
  lead,
  contactId,
  onClose,
  onLogged,
}: {
  lead: LeadForLog;
  contactId: string | null;
  onClose: () => void;
  onLogged: (lead: LeadForLog, result: LogActivityResult) => void;
}) {
  const { lists } = useApp();
  const profile = useProfile();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const types = useMemo(() => lists.activityTypes.filter((t) => t.is_active), [lists.activityTypes]);
  const schema = useMemo(
    () => makeLogActivitySchema({ types: lists.activityTypes, outcomes: lists.outcomes, timezone: profile.timezone }),
    [lists.activityTypes, lists.outcomes, profile.timezone],
  );
  const [nowInput] = useState(() => toLocalDateTimeInput(new Date(), profile.timezone));
  const [minInput] = useState(() => toLocalDateTimeInput(new Date(Date.now() - MAX_BACKDATE_DAYS * 86_400_000), profile.timezone));

  const firstType = types[0];
  const primary = lead.contacts.find((c) => c.is_primary) ?? lead.contacts[0];
  const form = useForm<LogActivityValues, unknown, LogActivityData>({
    resolver: zodResolver(schema),
    defaultValues: {
      leadId: lead.id,
      activityTypeId: firstType?.id ?? "",
      outcomeKey: firstType
        ? defaultOutcome(firstType.category, outcomesFor(firstType.category, lists.outcomes).map((o) => o.key))
        : "",
      contactId: contactId ?? primary?.id ?? null,
      occurredAt: nowInput,
      notes: "",
      nextAction: "",
      nextActionDue: null,
      noNextStep: false,
      meeting: {
        startsAt: "",
        timezone: lead.lead_timezone ?? profile.timezone,
        durationMin: 30,
        location: "",
        agenda: "",
        reminders: lead.meetingReminders,
        addToCalendar: true,
        inviteContact: false,
      },
    },
  });
  const { control, register, formState, setValue } = form;
  const errors = formState.errors;
  const typeId = useWatch({ control, name: "activityTypeId" });
  const outcomeKey = useWatch({ control, name: "outcomeKey" });
  const noNextStep = useWatch({ control, name: "noNextStep" });
  const chosenContact = useWatch({ control, name: "contactId" });
  const booking = outcomeKey === MEETING_OUTCOME;
  const contactEmail = lead.contacts.find((c) => c.id === chosenContact)?.email ?? null;
  const contactLabel = lead.contacts.find((c) => c.id === chosenContact)?.name ?? lead.company_name;
  const type = lists.activityTypes.find((t) => t.id === typeId);
  const allowed = outcomesFor(type?.category, lists.outcomes);
  const nextOptional = NO_NEXT_ACTION_OUTCOMES.includes(outcomeKey);

  const byCategory = ACTIVITY_CATEGORIES.map((c) => ({ c, items: types.filter((t) => t.category === c) })).filter(
    (g) => g.items.length,
  );

  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Log activity"
      description={
        <span className="inline-flex items-center gap-2">
          {lead.company_name} <StatusChip status={lead.status} />
        </span>
      }
      dirty={formState.isDirty}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="log-activity-form" pending={pending}>
            Log activity
          </Button>
        </div>
      }
    >
      <form
        id="log-activity-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(() =>
          startTransition(async () => {
            setFormError(null);
            const res = await logActivity(form.getValues());
            if (!res.ok) {
              applyFieldErrors(form.setError, res.fieldErrors);
              setFormError(res.error);
              return;
            }
            toast.success(res.data.meetingId ? "Meeting booked" : "Activity logged");
            router.refresh();
            onLogged(lead, res.data);
          }),
        )}
      >
        {formError && (
          <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">
            {formError}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Type" htmlFor="log-type" required error={errors.activityTypeId?.message}>
            <Controller
              control={control}
              name="activityTypeId"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    const t = lists.activityTypes.find((x) => x.id === v);
                    if (t) {
                      const keys = outcomesFor(t.category, lists.outcomes).map((o) => o.key);
                      setValue("outcomeKey", defaultOutcome(t.category, keys), { shouldDirty: true });
                    }
                  }}
                >
                  <SelectTrigger id="log-type" className="w-full bg-surface">
                    <SelectValue placeholder="Pick a type" />
                  </SelectTrigger>
                  <SelectContent>
                    {byCategory.map((g) => (
                      <SelectGroup key={g.c}>
                        <SelectLabel>{CATEGORY_LABELS[g.c as ActivityCategory]}</SelectLabel>
                        {g.items.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField label="Outcome" htmlFor="log-outcome" required error={errors.outcomeKey?.message}>
            <Controller
              control={control}
              name="outcomeKey"
              render={({ field }) => (
                <SelectField
                  key={typeId}
                  id="log-outcome"
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? "")}
                  options={allowed.map((o) => ({ value: o.key, label: lists.outcomes.find((x) => x.key === o.key)?.label ?? o.key }))}
                  placeholder="Pick an outcome"
                  invalid={!!errors.outcomeKey}
                />
              )}
            />
          </FormField>
          <FormField label="Contact" htmlFor="log-contact">
            <Controller
              control={control}
              name="contactId"
              render={({ field }) => (
                <SelectField
                  id="log-contact"
                  value={field.value ?? null}
                  onChange={field.onChange}
                  noneLabel="No contact"
                  options={lead.contacts.map((c) => ({ value: c.id, label: c.is_primary ? `${c.name} (primary)` : c.name }))}
                />
              )}
            />
          </FormField>
          <FormField label="When" htmlFor="log-when" error={errors.occurredAt?.message} helper={`Up to ${MAX_BACKDATE_DAYS} days back.`}>
            <Input id="log-when" type="datetime-local" min={minInput} max={nowInput} aria-invalid={!!errors.occurredAt} {...register("occurredAt")} />
          </FormField>
        </div>
        <FormField label="Notes" htmlFor="log-notes" error={errors.notes?.message}>
          <Textarea id="log-notes" rows={3} {...register("notes")} />
        </FormField>

        {booking && (
          <fieldset className="flex flex-col gap-3 rounded-lg border border-line p-4" data-testid="meeting-section">
            <legend className="px-1 text-section text-ink">Meeting</legend>
            <Controller
              control={control}
              name="meeting"
              render={({ field }) => {
                const e = errors.meeting as Partial<Record<string, { message?: string }>> | undefined;
                const meetingErrors: MeetingErrors = Object.fromEntries(
                  Object.entries(e ?? {}).map(([k, v]) => [k, v?.message]),
                );
                return (
                  <MeetingFields
                    idPrefix="log-meeting"
                    value={field.value!}
                    onChange={(patch) => field.onChange({ ...field.value!, ...patch })}
                    errors={meetingErrors}
                    viewerTz={profile.timezone}
                    contactEmail={contactEmail}
                    calendar={lead.calendar}
                  />
                );
              }}
            />
            <p className="text-small text-ink-muted">Next action becomes &ldquo;Meeting with {contactLabel}&rdquo; on the meeting day.</p>
          </fieldset>
        )}

        <fieldset className={cn("flex flex-col gap-3 rounded-lg border border-line p-4", booking && "hidden")}>
          <legend className="px-1 text-section text-ink">Next action</legend>
          {lead.next_action && (
            <p className="text-small text-ink-muted">
              Current: {lead.next_action}
              {lead.next_action_due && `, due ${lead.next_action_due}`}
            </p>
          )}
          <FormField
            label="What's next"
            htmlFor="log-next"
            error={errors.nextAction?.message}
            helper={nextOptional ? "Optional for this outcome." : undefined}
          >
            <Input id="log-next" disabled={!!noNextStep} placeholder="Send case study" aria-invalid={!!errors.nextAction} {...register("nextAction")} />
          </FormField>
          <FormField label="Due" htmlFor="log-next-due" error={errors.nextActionDue?.message}>
            <Controller
              control={control}
              name="nextActionDue"
              render={({ field }) => (
                <DueDateChips id="log-next-due" value={field.value ?? null} onChange={field.onChange} disabled={!!noNextStep} invalid={!!errors.nextActionDue} />
              )}
            />
          </FormField>
          <Controller
            control={control}
            name="noNextStep"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-body text-ink">
                <Checkbox
                  checked={!!field.value}
                  onCheckedChange={(v) => {
                    field.onChange(!!v);
                    if (v) {
                      form.clearErrors(["nextAction", "nextActionDue"]);
                    }
                  }}
                />
                No next step
              </label>
            )}
          />
        </fieldset>
      </form>
    </FormSheet>
  );
}
