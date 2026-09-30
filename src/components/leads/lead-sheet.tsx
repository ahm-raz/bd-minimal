"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "@/components/app/nav-progress";
import { Controller, useFieldArray, useForm, useWatch, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/common/form-field";
import { FormSheet } from "@/components/common/form-sheet";
import { SelectField } from "@/components/common/select-field";
import { Combobox } from "@/components/common/combobox";
import { DueDateChips } from "@/components/common/due-date-chips";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { COMPANY_SIZES, EMAIL_STATUSES, EMAIL_STATUS_LABELS, PRIORITIES, PRIORITY_LABELS } from "@/lib/domain";
import { completenessChecks, completenessScore, completenessTone } from "@/lib/completeness";
import { formatDateTime, timeZoneList } from "@/lib/dates";
import { COUNTRIES, DEFAULT_COUNTRY, splitPastedName, suggestTimezone } from "@/lib/validation/normalize";
import { emptyContact, makeLeadSchema, MAX_CONTACTS, type LeadData, type LeadFormValues } from "@/lib/validation/lead";
import { applyFieldErrors } from "@/lib/forms";
import { createLead, findDuplicates, updateLead, type DuplicateMatch } from "@/server/actions/leads";

type Values = LeadFormValues;

/** Fields in the quick part of the form. Everything else sits under "More details" (docs/07 section 4). */
const QUICK_FIELDS = new Set([
  "company_name",
  "website",
  "company_linkedin_url",
  "niche_id",
  "channel_id",
  "source_id",
  "upwork_job_url",
  "next_action",
  "next_action_due",
  "contacts.0.first_name",
  "contacts.0.last_name",
  "contacts.0.job_title",
  "contacts.0.email",
  "contacts.0.phone",
  "contacts.0.linkedin_url",
]);

function blankLead(defaults: Partial<Values> | undefined, primaryNicheId: string | null): Values {
  return {
    company_name: "",
    website: "",
    company_linkedin_url: "",
    company_phone: "",
    company_email: "",
    company_size: null,
    sub_niche: "",
    address: "",
    city: "",
    state_region: "",
    country: DEFAULT_COUNTRY,
    lead_timezone: "",
    google_maps_url: "",
    google_rating: "",
    google_review_count: "",
    upwork_job_url: "",
    niche_id: primaryNicheId ?? "",
    channel_id: "",
    source_id: null,
    campaign_id: null,
    priority: "medium",
    tags: [],
    pain_point: "",
    offer: "",
    notes: "",
    next_action: "",
    next_action_due: "",
    contacts: [emptyContact(true)],
    ...defaults,
  };
}

/** The global Add / Edit lead side panel (docs/07 section 4). */
export function LeadSheet() {
  const { leadSheet, closeLeadSheet } = useApp();
  if (!leadSheet) return null;
  const key = leadSheet.mode === "edit" ? `edit-${leadSheet.values.id}` : "new";
  return <LeadSheetForm key={key} state={leadSheet} onClose={closeLeadSheet} />;
}

/** "More details": always starts closed, so the form stays short. Jumping to a field inside opens it. */
function useMoreDetails() {
  const [open, setOpen] = useState(false);
  return { open, toggle: () => setOpen((o) => !o), reveal: () => setOpen(true) };
}

function LeadSheetForm({
  state,
  onClose,
}: {
  state: NonNullable<ReturnType<typeof useApp>["leadSheet"]>;
  onClose: () => void;
}) {
  const { lists } = useApp();
  const profile = useProfile();
  const router = useRouter();
  const isFounder = profile.role === "founder";
  const editing = state.mode === "edit";
  const upworkChannelId = lists.channels.find((c) => c.name.toLowerCase() === "upwork")?.id ?? null;
  const schema = useMemo(() => makeLeadSchema({ upworkChannelId }), [upworkChannelId]);

  const initial = editing ? state.values : blankLead(state.defaults, profile.primaryNicheId);
  const form = useForm<Values, unknown, LeadData>({ resolver: zodResolver(schema), defaultValues: initial, mode: "onSubmit" });
  const { register, control, formState, setValue, getValues, setFocus } = form;
  const errors = formState.errors;
  const contactsArray = useFieldArray({ control, name: "contacts" });
  const [pending, startTransition] = useTransition();
  // Separate transition: a duplicate check started by blurring a field must not disable Save.
  const [, startCheck] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [dismissedDupes, setDismissedDupes] = useState<string[]>([]);
  const more = useMoreDetails();
  const [showMissing, setShowMissing] = useState(false);
  const tzSuggested = useRef<string | null>(null);

  const watched = useWatch({ control }) as Values;
  const channelId = watched.channel_id;
  const nicheId = watched.niche_id;
  const isUpwork = !!upworkChannelId && channelId === upworkChannelId;

  // Live completeness meter (same rules as the database).
  const leadForScore = {
    website: watched.website,
    company_linkedin_url: watched.company_linkedin_url,
    city: watched.city,
    state_region: watched.state_region,
    pain_point: watched.pain_point,
    source_id: watched.source_id,
  };
  const contactsForScore = (watched.contacts ?? []).map((c, i) => ({ ...c, is_primary: i === 0 }));
  const trimmed = (v: unknown) => (typeof v === "string" ? v.trim() : v);
  const scoreInput = {
    lead: Object.fromEntries(Object.entries(leadForScore).map(([k, v]) => [k, trimmed(v)])),
    contacts: contactsForScore.map((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, trimmed(v)]))),
  };
  const checks = completenessChecks(scoreInput.lead, scoreInput.contacts);
  const score = completenessScore(scoreInput.lead, scoreInput.contacts);
  const tone = completenessTone(score);

  // Lead time zone suggested from the US state (user can change it).
  useEffect(() => {
    const suggestion = suggestTimezone(watched.state_region, watched.country);
    const current = getValues("lead_timezone");
    if (suggestion && (!current || current === tzSuggested.current)) {
      setValue("lead_timezone", suggestion, { shouldDirty: true });
      tzSuggested.current = suggestion;
    }
  }, [watched.state_region, watched.country, getValues, setValue]);

  const runDuplicateCheck = () => {
    const v = getValues();
    startCheck(async () => {
      const res = await findDuplicates({
        companyName: v.company_name,
        website: v.website,
        emails: (v.contacts ?? []).map((c) => c.email ?? "").filter(Boolean),
        linkedins: (v.contacts ?? []).map((c) => c.linkedin_url ?? "").filter(Boolean),
        excludeId: editing ? state.values.id : null,
      });
      if (res.ok) setDuplicates(res.data);
    });
  };
  const visibleDupes = duplicates.filter((d) => !dismissedDupes.includes(d.id));

  const focusField = (field: string) => {
    if (!QUICK_FIELDS.has(field)) more.reveal();
    setTimeout(() => {
      try {
        setFocus(field as FieldPath<Values>);
      } catch {
        document.getElementById(field)?.focus();
      }
      // The field may have just been revealed under More details; bring it into view.
      document.getElementById(field)?.scrollIntoView({ block: "center" });
    }, 50);
  };

  const submit = (addAnother: boolean) =>
    form.handleSubmit(
      () =>
        startTransition(async () => {
          setFormError(null);
          const raw = getValues();
          const payload: Values = {
            ...raw,
            contacts: raw.contacts.map((c, i) => ({ ...c, is_primary: i === 0 })),
          };
          const res = editing ? await updateLead(payload) : await createLead(payload);
          if (!res.ok) {
            applyFieldErrors(form.setError, res.fieldErrors);
            setFormError(res.error);
            return;
          }
          toast.success("Lead saved", editing ? undefined : {
            action: { label: "Open lead", onClick: () => router.push(`/leads/${res.data.id}`) },
          });
          router.refresh();
          if (addAnother) {
            const keep = { niche_id: raw.niche_id, channel_id: raw.channel_id, campaign_id: raw.campaign_id, source_id: raw.source_id };
            form.reset(blankLead(keep, profile.primaryNicheId));
            setDuplicates([]);
            setDismissedDupes([]);
            tzSuggested.current = null;
            setTimeout(() => setFocus("company_name"), 50);
          } else {
            onClose();
          }
        }),
      (errs) => {
        // jump to the first error, opening More details if it's in there
        const first = Object.keys(errs)[0];
        if (first === "contacts") {
          const byIndex = (errs.contacts as unknown as Record<string, Record<string, unknown> | undefined>) ?? {};
          const i = Object.keys(byIndex).find((k) => /^\d+$/.test(k));
          const f = i ? Object.keys(byIndex[i] ?? {})[0] : undefined;
          if (i && f) focusField(`contacts.${i}.${f}`);
        } else if (first && first !== "reach") {
          focusField(first);
        }
      },
    )();

  const opts = <T extends { id: string; name: string; is_active: boolean }>(list: T[], current: string | null | undefined) =>
    list.filter((x) => x.is_active || x.id === current).map((x) => ({ value: x.id, label: x.name }));
  const campaignOptions = lists.campaigns
    .filter((c) => (c.status === "active" && (!c.niche_id || c.niche_id === nicheId)) || c.id === watched.campaign_id)
    .map((c) => ({ value: c.id, label: c.name }));
  const members = lists.salesMembers.filter((m) => m.is_active || m.id === watched.owner_id);

  const reachError = (errors as Record<string, { message?: string } | undefined>).reach?.message;

  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={editing ? `Edit ${state.values.company_name}` : "New lead"}
      description={
        editing
          ? `Added by ${lists.members.find((m) => m.id === state.meta.createdBy)?.full_name ?? "someone"}, ${formatDateTime(state.meta.createdAt, profile.timezone)}`
          : undefined
      }
      dirty={formState.isDirty}
      footer={
        <div className="flex w-full flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-expanded={showMissing}
                aria-controls="lead-missing-items"
                onClick={() => setShowMissing((v) => !v)}
                disabled={score === 100}
                className="flex items-center gap-1 text-small text-ink-muted hover:text-ink disabled:hover:text-ink-muted"
              >
                {score < 100 && (
                  <ChevronDown className={cn("size-3.5 transition-transform", !showMissing && "-rotate-90")} aria-hidden />
                )}
                Completeness
              </button>
              <div
                role="meter"
                aria-label="Completeness"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={score}
                className="h-1.5 flex-1 rounded-full bg-surface-muted"
              >
                <div
                  className={cn("h-full rounded-full transition-[width] duration-300", {
                    "bg-bad": tone === "bad",
                    "bg-warn": tone === "warn",
                    "bg-ok": tone === "ok",
                  })}
                  style={{ width: `${score}%` }}
                />
              </div>
              <span className="num w-10 text-right text-small font-medium text-ink" data-testid="completeness-score">
                {score}%
              </span>
            </div>
            {score < 100 && showMissing && (
              <div id="lead-missing-items" className="flex flex-wrap gap-x-3 gap-y-1">
                {checks
                  .filter((c) => !c.done)
                  .map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => focusField(c.field)}
                      className="text-small text-accent-strong underline-offset-2 hover:underline"
                    >
                      {c.missingLabel}
                    </button>
                  ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onClose()}>
              Cancel
            </Button>
            {!editing && (
              <Button type="button" variant="secondary" disabled={pending} onClick={() => submit(true)}>
                Save and add another
              </Button>
            )}
            <Button type="button" disabled={pending} onClick={() => submit(false)}>
              Save lead
            </Button>
          </div>
        </div>
      }
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
        className="flex flex-col gap-6"
      >
        {formError && !reachError && (
          <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">
            {formError}
          </p>
        )}

        {visibleDupes.map((d) => (
          <div key={d.id} role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-warn-soft px-3 py-2 text-small text-warn-ink">
            <span className="flex-1">
              You already have {d.company_name} ({d.statusLabel}).
            </span>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/leads/${d.id}`} onClick={() => onClose()}>
                Open lead
              </Link>
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDismissedDupes((x) => [...x, d.id])}>
              Add anyway
            </Button>
          </div>
        ))}

        {/* Quick add: what's needed to start outreach. Everything else is under More details. */}
        <Section title="Company">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Company name" htmlFor="company_name" required error={errors.company_name?.message}>
              <Input
                id="company_name"
                autoFocus={!editing}
                aria-invalid={!!errors.company_name}
                {...register("company_name", { onBlur: runDuplicateCheck })}
              />
            </FormField>
            <FormField label="Website" htmlFor="website" error={errors.website?.message}>
              <Input id="website" placeholder="brightsmile.com" aria-invalid={!!errors.website} {...register("website", { onBlur: runDuplicateCheck })} />
            </FormField>
            <FormField label="Company LinkedIn URL" htmlFor="company_linkedin_url" error={errors.company_linkedin_url?.message}>
              <Input
                id="company_linkedin_url"
                placeholder="linkedin.com/company/…"
                aria-invalid={!!errors.company_linkedin_url}
                {...register("company_linkedin_url")}
              />
            </FormField>
          </div>
        </Section>

        <Section title="Primary contact">
          {reachError && (
            <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad" data-testid="reach-error">
              {reachError}
            </p>
          )}
          {contactsArray.fields[0] && <ContactFields index={0} part="quick" form={form} onDuplicateCheck={runDuplicateCheck} />}
        </Section>

        <Section title="Classification">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Niche" htmlFor="niche_id" required error={errors.niche_id?.message}>
              <Controller
                control={control}
                name="niche_id"
                render={({ field }) => (
                  <SelectField id="niche_id" value={field.value || null} onChange={(v) => field.onChange(v ?? "")} options={opts(lists.niches, field.value)} placeholder="Pick a niche" invalid={!!errors.niche_id} />
                )}
              />
            </FormField>
            <FormField label="Channel" htmlFor="channel_id" required error={errors.channel_id?.message}>
              <Controller
                control={control}
                name="channel_id"
                render={({ field }) => (
                  <SelectField id="channel_id" value={field.value || null} onChange={(v) => field.onChange(v ?? "")} options={opts(lists.channels, field.value)} placeholder="Pick a channel" invalid={!!errors.channel_id} />
                )}
              />
            </FormField>
            <FormField label="Lead source" htmlFor="source_id">
              <Controller
                control={control}
                name="source_id"
                render={({ field }) => (
                  <SelectField id="source_id" value={field.value ?? null} onChange={field.onChange} options={opts(lists.sources, field.value)} noneLabel="Not set" />
                )}
              />
            </FormField>
          </div>
          {(isUpwork || watched.upwork_job_url) && (
            <FormField
              label="Upwork job URL"
              htmlFor="upwork_job_url"
              error={errors.upwork_job_url?.message}
              helper={isUpwork ? "Required if you have no other way to reach them." : undefined}
            >
              <Input id="upwork_job_url" aria-invalid={!!errors.upwork_job_url} {...register("upwork_job_url")} />
            </FormField>
          )}
        </Section>

        <Section title={editing ? "Next action" : "First step"}>
          {!editing && <p className="-mt-2 text-small text-ink-muted">Optional. Leads without one show in the No next action view.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Next action" htmlFor="next_action" error={errors.next_action?.message}>
              <Input id="next_action" placeholder="Send connection request" {...register("next_action")} />
            </FormField>
            <FormField label="Due" htmlFor="next_action_due" error={errors.next_action_due?.message}>
              <Controller
                control={control}
                name="next_action_due"
                render={({ field }) => (
                  <DueDateChips id="next_action_due" value={field.value || null} onChange={field.onChange} invalid={!!errors.next_action_due} />
                )}
              />
            </FormField>
          </div>
        </Section>

        {/* More details: closed by default for a new lead; remembered per person */}
        <section className="flex flex-col gap-6 border-t border-line pt-4" aria-label="More details">
          <h3>
            <button
              type="button"
              aria-expanded={more.open}
              aria-controls="lead-more-details"
              onClick={more.toggle}
              className="flex w-full items-center gap-2 text-left text-section text-ink"
            >
              <ChevronDown className={cn("size-4 text-ink-muted transition-transform", !more.open && "-rotate-90")} aria-hidden />
              More details
              {!more.open && (
                <span className="text-small font-normal text-ink-muted">Company, more contacts, location, online, sales notes</span>
              )}
            </button>
          </h3>
          <div id="lead-more-details" hidden={!more.open} className="flex flex-col gap-6">
            <Section title="Company details">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Company phone" htmlFor="company_phone" error={errors.company_phone?.message}>
                  <Input id="company_phone" type="tel" aria-invalid={!!errors.company_phone} {...register("company_phone")} />
                </FormField>
                <FormField label="Company email" htmlFor="company_email" error={errors.company_email?.message}>
                  <Input id="company_email" type="email" aria-invalid={!!errors.company_email} {...register("company_email")} />
                </FormField>
                <FormField label="Company size" htmlFor="company_size">
                  <Controller
                    control={control}
                    name="company_size"
                    render={({ field }) => (
                      <SelectField
                        id="company_size"
                        value={field.value ?? null}
                        onChange={field.onChange}
                        noneLabel="Not set"
                        options={COMPANY_SIZES.map((s) => ({ value: s, label: s }))}
                      />
                    )}
                  />
                </FormField>
                <FormField label="Sub-niche" htmlFor="sub_niche" error={errors.sub_niche?.message}>
                  <Input id="sub_niche" placeholder="Pediatric dentistry" {...register("sub_niche")} />
                </FormField>
              </div>
            </Section>

            <Section title={`${watched.contacts?.[0]?.first_name || "Primary contact"}: more`}>
              {contactsArray.fields[0] && <ContactFields index={0} part="extra" form={form} onDuplicateCheck={runDuplicateCheck} />}
            </Section>

            <Section title={`More contacts${contactsArray.fields.length > 1 ? ` (${contactsArray.fields.length - 1})` : ""}`}>
              {contactsArray.fields.slice(1).map((f, j) => {
                const index = j + 1;
                const name = watched.contacts?.[index]?.first_name || `Contact ${index + 1}`;
                return (
                  <div key={f.id} className="flex flex-col gap-4 rounded-lg border border-line p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-body font-medium text-ink">{name}</span>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => contactsArray.move(index, 0)}>
                          <Star aria-hidden /> Make primary
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => contactsArray.remove(index)}>
                          <Trash2 aria-hidden /> Remove
                        </Button>
                      </div>
                    </div>
                    <ContactFields index={index} part="all" form={form} onDuplicateCheck={runDuplicateCheck} />
                  </div>
                );
              })}
              {contactsArray.fields.length < MAX_CONTACTS && (
                <Button type="button" variant="secondary" className="self-start" onClick={() => contactsArray.append(emptyContact(false))}>
                  <Plus aria-hidden /> Add contact
                </Button>
              )}
            </Section>

            <Section title="Location">
              <FormField label="Address" htmlFor="address">
                <Input id="address" {...register("address")} />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="City" htmlFor="city" error={errors.city?.message}>
                  <Input id="city" {...register("city")} />
                </FormField>
                <FormField label="State or region" htmlFor="state_region" error={errors.state_region?.message}>
                  <Input id="state_region" placeholder="TX" {...register("state_region")} />
                </FormField>
                <FormField label="Country" htmlFor="country">
                  <Controller
                    control={control}
                    name="country"
                    render={({ field }) => (
                      <Combobox
                        id="country"
                        value={field.value ?? DEFAULT_COUNTRY}
                        onChange={(v) => field.onChange(v ?? DEFAULT_COUNTRY)}
                        options={COUNTRIES.map((c) => ({ value: c.name, label: c.name }))}
                        searchPlaceholder="Search countries"
                      />
                    )}
                  />
                </FormField>
                <FormField
                  label="Lead time zone"
                  htmlFor="lead_timezone"
                  error={errors.lead_timezone?.message}
                  helper="Suggested from the state. Shows their local time on the lead page."
                >
                  <Controller
                    control={control}
                    name="lead_timezone"
                    render={({ field }) => (
                      <Combobox
                        id="lead_timezone"
                        value={field.value || null}
                        onChange={(v) => {
                          tzSuggested.current = null;
                          field.onChange(v ?? "");
                        }}
                        allowClear
                        clearLabel="Not set"
                        placeholder="Not set"
                        options={timeZoneList().map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }))}
                        searchPlaceholder="Search time zones"
                      />
                    )}
                  />
                </FormField>
              </div>
            </Section>

            <Section title="Online presence">
              <FormField label="Google Maps URL" htmlFor="google_maps_url" error={errors.google_maps_url?.message}>
                <Input id="google_maps_url" aria-invalid={!!errors.google_maps_url} {...register("google_maps_url")} />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Google rating" htmlFor="google_rating" error={errors.google_rating?.message}>
                  <Input id="google_rating" inputMode="decimal" placeholder="4.7" aria-invalid={!!errors.google_rating} {...register("google_rating")} />
                </FormField>
                <FormField label="Review count" htmlFor="google_review_count" error={errors.google_review_count?.message}>
                  <Input id="google_review_count" inputMode="numeric" placeholder="212" aria-invalid={!!errors.google_review_count} {...register("google_review_count")} />
                </FormField>
              </div>
            </Section>

            <Section title="Campaign and tags">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Campaign" htmlFor="campaign_id">
                  <Controller
                    control={control}
                    name="campaign_id"
                    render={({ field }) => (
                      <SelectField id="campaign_id" value={field.value ?? null} onChange={field.onChange} options={campaignOptions} noneLabel="No campaign" />
                    )}
                  />
                </FormField>
                <FormField label="Priority" htmlFor="priority">
                  <Controller
                    control={control}
                    name="priority"
                    render={({ field }) => (
                      <SelectField id="priority" value={field.value ?? "medium"} onChange={(v) => field.onChange(v ?? "medium")} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))} />
                    )}
                  />
                </FormField>
                <FormField label="Tags" htmlFor="tags" error={errors.tags?.message} helper="Separate with commas.">
                  <Controller
                    control={control}
                    name="tags"
                    render={({ field }) => (
                      <TagsInput id="tags" value={field.value ?? []} onChange={field.onChange} invalid={!!errors.tags} />
                    )}
                  />
                </FormField>
                {editing && isFounder && (
                  <FormField label="Owner" htmlFor="owner_id" helper="Changing the owner moves open opportunities with the lead.">
                    <Controller
                      control={control}
                      name="owner_id"
                      render={({ field }) => (
                        <SelectField
                          id="owner_id"
                          value={field.value ?? state.meta.ownerId}
                          onChange={field.onChange}
                          options={members.map((m) => ({ value: m.id, label: m.full_name || m.email }))}
                        />
                      )}
                    />
                  </FormField>
                )}
              </div>
            </Section>

            <Section title="Sales context">
              <FormField label="Pain point" htmlFor="pain_point" error={errors.pain_point?.message} helper="What problem do they likely have?">
                <Textarea id="pain_point" rows={2} {...register("pain_point")} />
              </FormField>
              <FormField label="Offer" htmlFor="offer" error={errors.offer?.message} helper="What we'd sell them.">
                <Textarea id="offer" rows={2} {...register("offer")} />
              </FormField>
              <FormField label="Notes" htmlFor="notes" error={errors.notes?.message}>
                <Textarea id="notes" rows={3} {...register("notes")} />
              </FormField>
            </Section>
          </div>
        </section>
      </form>
    </FormSheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4" aria-label={title}>
      <h3 className="text-section text-ink">{title}</h3>
      {children}
    </section>
  );
}

/**
 * One contact's fields. "quick": name, job title, email, phone, LinkedIn (the quick-add part for the primary
 * contact). "extra": the rest (under More details). "all": both, for additional contacts.
 */
function ContactFields({
  index,
  part,
  form,
  onDuplicateCheck,
}: {
  index: number;
  part: "quick" | "extra" | "all";
  form: ReturnType<typeof useForm<Values, unknown, LeadData>>;
  onDuplicateCheck: () => void;
}) {
  const { lists } = useApp();
  const { register, control, setValue, formState } = form;
  const e = formState.errors.contacts?.[index];
  const id = (f: string) => `contacts.${index}.${f}`;
  const firstName = register(`contacts.${index}.first_name`);
  const quick = part !== "extra";
  const extra = part !== "quick";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {quick && (
        <>
          <FormField label="First name" htmlFor={id("first_name")} required error={e?.first_name?.message}>
            <Input
              id={id("first_name")}
              aria-invalid={!!e?.first_name}
              {...firstName}
              onPaste={(ev) => {
                const text = ev.clipboardData.getData("text");
                const split = splitPastedName(text);
                if (split.linkedin) {
                  ev.preventDefault();
                  setValue(`contacts.${index}.linkedin_url`, split.linkedin, { shouldDirty: true });
                  toast("LinkedIn URL moved to the LinkedIn field");
                } else if (split.last) {
                  ev.preventDefault();
                  setValue(`contacts.${index}.first_name`, split.first ?? "", { shouldDirty: true });
                  setValue(`contacts.${index}.last_name`, split.last, { shouldDirty: true });
                }
              }}
            />
          </FormField>
          <FormField label="Last name" htmlFor={id("last_name")}>
            <Input id={id("last_name")} {...register(`contacts.${index}.last_name`)} />
          </FormField>
          <FormField label="Job title" htmlFor={id("job_title")} error={e?.job_title?.message}>
            <Input id={id("job_title")} placeholder="Owner" {...register(`contacts.${index}.job_title`)} />
          </FormField>
          <FormField label="Email" htmlFor={id("email")} error={e?.email?.message}>
            <Input id={id("email")} type="email" aria-invalid={!!e?.email} {...register(`contacts.${index}.email`, { onBlur: onDuplicateCheck })} />
          </FormField>
          <FormField label="Phone" htmlFor={id("phone")} error={e?.phone?.message}>
            <Input id={id("phone")} type="tel" aria-invalid={!!e?.phone} {...register(`contacts.${index}.phone`)} />
          </FormField>
          <FormField label="LinkedIn URL" htmlFor={id("linkedin_url")} error={e?.linkedin_url?.message}>
            <Input id={id("linkedin_url")} aria-invalid={!!e?.linkedin_url} {...register(`contacts.${index}.linkedin_url`, { onBlur: onDuplicateCheck })} />
          </FormField>
        </>
      )}
      {extra && (
        <>
          <div className="flex items-end pb-2">
            <Controller
              control={control}
              name={`contacts.${index}.is_decision_maker`}
              render={({ field }) => (
                <div className="flex items-center gap-2">
                  <Switch id={id("is_decision_maker")} checked={!!field.value} onCheckedChange={field.onChange} ref={field.ref} />
                  <Label htmlFor={id("is_decision_maker")} className="text-body text-ink">
                    Decision maker
                  </Label>
                </div>
              )}
            />
          </div>
          <FormField label="Email status" htmlFor={id("email_status")}>
            <Controller
              control={control}
              name={`contacts.${index}.email_status`}
              render={({ field }) => (
                <SelectField
                  id={id("email_status")}
                  value={field.value ?? "unverified"}
                  onChange={(v) => field.onChange(v ?? "unverified")}
                  options={EMAIL_STATUSES.map((s) => ({ value: s, label: EMAIL_STATUS_LABELS[s] }))}
                />
              )}
            />
          </FormField>
          <FormField label="Mobile" htmlFor={id("mobile_phone")} error={e?.mobile_phone?.message}>
            <Input id={id("mobile_phone")} type="tel" aria-invalid={!!e?.mobile_phone} {...register(`contacts.${index}.mobile_phone`)} />
          </FormField>
          <FormField label="Preferred channel" htmlFor={id("preferred_channel_id")}>
            <Controller
              control={control}
              name={`contacts.${index}.preferred_channel_id`}
              render={({ field }) => (
                <SelectField
                  id={id("preferred_channel_id")}
                  value={field.value ?? null}
                  onChange={field.onChange}
                  noneLabel="Not set"
                  options={lists.channels.filter((c) => c.is_active || c.id === field.value).map((c) => ({ value: c.id, label: c.name }))}
                />
              )}
            />
          </FormField>
          <FormField label="Other social URL" htmlFor={id("other_social_url")} error={e?.other_social_url?.message}>
            <Input id={id("other_social_url")} aria-invalid={!!e?.other_social_url} {...register(`contacts.${index}.other_social_url`)} />
          </FormField>
          <FormField label="Secondary email" htmlFor={id("secondary_email")} error={e?.secondary_email?.message}>
            <Input id={id("secondary_email")} type="email" aria-invalid={!!e?.secondary_email} {...register(`contacts.${index}.secondary_email`)} />
          </FormField>
        </>
      )}
    </div>
  );
}

function TagsInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string[];
  onChange: (tags: string[]) => void;
  invalid?: boolean;
}) {
  const [text, setText] = useState(value.join(", "));
  const [last, setLast] = useState(value);
  if (last !== value && value.join(", ") !== text.split(",").map((t) => t.trim()).filter(Boolean).join(", ")) {
    setLast(value);
    setText(value.join(", "));
  }
  return (
    <Input
      id={id}
      value={text}
      aria-invalid={invalid}
      placeholder="texas, pediatric"
      onChange={(e) => {
        setText(e.target.value);
        const tags = e.target.value.split(",").map((t) => t.trim()).filter(Boolean);
        setLast(tags);
        onChange(tags);
      }}
    />
  );
}
