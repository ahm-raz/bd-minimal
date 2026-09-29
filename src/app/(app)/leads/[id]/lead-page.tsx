"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Flag, MapPin, MoreHorizontal, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Chip, StatusChip } from "@/components/common/chips";
import { FormField } from "@/components/common/form-field";
import { Panel, PanelHeader } from "@/components/common/page";
import { SelectField } from "@/components/common/select-field";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { ContactsPanel } from "@/components/leads/contacts-panel";
import { NextActionBox } from "@/components/leads/next-action-box";
import { LeadLocalTime } from "@/components/leads/lead-local-time";
import { Timeline } from "@/components/leads/timeline";
import { CreateOpportunityDialog } from "@/components/activities/opportunity-prompts";
import { FlagLeadDialog } from "@/components/leads/flag-dialog";
import { OpportunitySheet } from "@/components/pipeline/opportunity-sheet";
import { useStageChange } from "@/components/pipeline/stage-change";
import { DetailField } from "@/components/leads/detail-field";
import { MeetingsPanel } from "@/components/meetings/meetings-panel";
import type { CalendarStatus } from "@/components/meetings/meeting-fields";
import { COMPANY_SIZES, LEAD_STATUSES, LEAD_STATUS_LABELS, PRIORITIES, PRIORITY_LABELS, type LeadPriority, type LeadStatus } from "@/lib/domain";
import { completenessTone } from "@/lib/completeness";
import { formatDateTime, timeZoneList } from "@/lib/dates";
import { COUNTRIES } from "@/lib/validation/normalize";
import type { LeadField, LeadFieldValue } from "@/lib/validation/lead-field";
import { formatMoney, formatPhone } from "@/lib/format";
import type { LeadFormValues } from "@/lib/validation/lead";
import { deleteLead, reassignLeads, setLeadPriority, setLeadStatus } from "@/server/actions/leads";
import type { LeadDetail } from "@/server/queries/lead-detail";

/** A lead page column: scrolls on its own on laptop screens (px/-mx keep focus rings from being clipped). */
const COLUMN = "flex min-w-0 flex-col gap-6 lg:-mx-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:px-1 lg:pb-2 lg:scrollbar-none";

export function LeadPage({ detail, formValues, calendar }: { detail: LeadDetail; formValues: LeadFormValues; calendar: CalendarStatus }) {
  const { lead, contacts, ownerEvents, openFlags, opportunities, activities, stageEvents, meetings } = detail;
  const { lists, openEditLead, openLogActivity, setCurrentLeadId } = useApp();
  const profile = useProfile();
  const isFounder = profile.role === "founder";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<null | "reassign" | "delete" | "opportunity" | "flag">(null);

  // The L shortcut logs against this lead while the page is open.
  useEffect(() => {
    setCurrentLeadId(lead.id);
    return () => setCurrentLeadId(null);
  }, [lead.id, setCurrentLeadId]);
  const logActivity = () => openLogActivity({ leadId: lead.id });
  const stageChange = useStageChange();
  const [openOpp, setOpenOpp] = useState<string | null>(null);

  const nameOf = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name ?? "";
  const activeOpts = (list: { id: string; name: string; is_active: boolean }[], current: string | null) =>
    list.filter((x) => x.is_active || x.id === current).map((x) => ({ value: x.id, label: x.name }));
  /** Shared props for a Details row that edits `field` in place. Text-like fields show their stored value. */
  const df = (field: LeadField, label: string) => {
    const value = lead[field] as LeadFieldValue;
    return { leadId: lead.id, field, label, value, country: lead.country, display: Array.isArray(value) ? undefined : (value ?? undefined) };
  };
  const memberName = (id: string | null) => lists.members.find((m) => m.id === id)?.full_name || "Someone";
  const place = [lead.city, lead.state_region].filter(Boolean).join(", ");
  const tone = completenessTone(lead.completeness);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(success);
      after?.();
      router.refresh();
    });

  const openEdit = () =>
    openEditLead({
      mode: "edit",
      values: formValues,
      meta: { createdBy: lead.created_by, createdAt: lead.created_at, ownerId: lead.owner_id },
    });

  return (
    <>
      {/* Laptop and up: the page fills the screen; the header stays put and each column scrolls on its own. */}
      <div className="flex flex-col lg:h-[calc(100dvh-3rem)]">
        <Link href="/leads" className="mb-3 inline-flex items-center gap-1 self-start text-small text-ink-muted hover:text-ink">
          <ArrowLeft className="size-3.5" aria-hidden /> Leads
        </Link>

        <header className="mb-6 flex shrink-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-title text-ink">{lead.company_name}</h1>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Status: ${LEAD_STATUS_LABELS[lead.status]}. Change status`} className="rounded-md">
                  <StatusChip status={lead.status} className="cursor-pointer" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                  value={lead.status}
                  onValueChange={(v) => run(() => setLeadStatus({ leadId: lead.id, status: v as LeadStatus }), `Status set to ${LEAD_STATUS_LABELS[v as LeadStatus]}`)}
                >
                  {LEAD_STATUSES.map((s) => (
                    <DropdownMenuRadioItem key={s} value={s}>
                      {LEAD_STATUS_LABELS[s]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Priority: ${PRIORITY_LABELS[lead.priority]}. Change priority`} className="rounded-md">
                  <Chip tone={lead.priority === "high" ? "accent" : "neutral"} className="cursor-pointer">
                    {PRIORITY_LABELS[lead.priority]}
                  </Chip>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                  value={lead.priority}
                  onValueChange={(v) => run(() => setLeadPriority({ leadId: lead.id, priority: v as LeadPriority }), "Priority changed")}
                >
                  {PRIORITIES.map((p) => (
                    <DropdownMenuRadioItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {openFlags.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Chip tone="bad" tabIndex={0} className="cursor-help" data-testid="flag-badge">
                    <Flag className="size-3" aria-hidden /> Flagged
                    <span className="sr-only">: {openFlags.map((f) => f.note).filter(Boolean).join(". ")}</span>
                  </Chip>
                </TooltipTrigger>
                <TooltipContent className="whitespace-pre-line">
                  {openFlags.map((f) => f.note).filter(Boolean).join("\n") || "Flagged by the founder"}
                </TooltipContent>
              </Tooltip>
            )}
            <div className="ml-auto flex items-center gap-3">
              {lead.lead_timezone && <LeadLocalTime tz={lead.lead_timezone} city={lead.city} />}
              <Button onClick={logActivity}>
                Log activity <kbd className="ml-1 font-mono text-micro font-normal opacity-80">L</kbd>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="icon" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={openEdit}>Edit</DropdownMenuItem>
                  {isFounder && (
                    <>
                      <DropdownMenuItem onSelect={() => setDialog("flag")}>Flag lead</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setDialog("reassign")}>Reassign</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-ink-muted">
            {place && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {place}
              </span>
            )}
            {lead.website && <ExternalA href={lead.website}>{lead.domain ?? lead.website}</ExternalA>}
            {lead.company_linkedin_url && <ExternalA href={lead.company_linkedin_url}>LinkedIn</ExternalA>}
            {lead.google_maps_url && <ExternalA href={lead.google_maps_url}>Maps</ExternalA>}
            {lead.upwork_job_url && <ExternalA href={lead.upwork_job_url}>Upwork job</ExternalA>}
            {lead.company_phone && (
              <a href={`tel:${lead.company_phone}`} className="num hover:text-ink">
                {formatPhone(lead.company_phone)}
              </a>
            )}
            {lead.google_rating !== null && (
              <span className="num inline-flex items-center gap-1">
                <Star className="size-3.5" aria-hidden />
                {Number(lead.google_rating).toFixed(1)}
                {lead.google_review_count !== null && ` (${lead.google_review_count})`}
              </span>
            )}
            <span className="inline-flex items-center gap-2">
              Completeness <span className="num font-medium text-ink">{lead.completeness}%</span>
              <span className="inline-block h-1.5 w-20 rounded-full bg-surface-muted" aria-hidden>
                <span
                  className={cn("block h-full rounded-full", { "bg-bad": tone === "bad", "bg-warn": tone === "warn", "bg-ok": tone === "ok" })}
                  style={{ width: `${lead.completeness}%` }}
                />
              </span>
            </span>
          </div>
        </header>

        <div className="grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className={COLUMN}>
            <NextActionBox leadId={lead.id} nextAction={lead.next_action} nextActionDue={lead.next_action_due} onLog={logActivity} />
            <Timeline
              lead={lead}
              activities={activities}
              stageEvents={stageEvents}
              ownerEvents={ownerEvents}
              opportunities={opportunities}
              contacts={contacts}
            />
          </div>

          <div className={COLUMN}>
            <ContactsPanel leadId={lead.id} contacts={contacts} country={lead.country} />

            <MeetingsPanel
              leadId={lead.id}
              companyName={lead.company_name}
              meetings={meetings}
              contacts={contacts}
              openOpportunities={opportunities.filter((o) => !["won", "lost"].includes(o.stage_key))}
              calendar={calendar}
            />

            <Panel>
              <PanelHeader
                title="Opportunities"
                actions={
                  <Button variant="ghost" size="sm" aria-label="New opportunity" onClick={() => setDialog("opportunity")}>
                    <Plus aria-hidden /> New
                  </Button>
                }
              />
              {opportunities.length === 0 ? (
                <p className="px-4 py-3 text-small text-ink-muted">No opportunities yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {opportunities.map((o) => (
                    <li key={o.id} className="flex items-center gap-2 px-4 py-2" data-testid={`opp-${o.title}`}>
                      <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => setOpenOpp(o.id)}>
                        {o.title}
                      </button>
                      <span className="num text-ink-muted">{formatMoney(o.stage_key === "won" ? o.won_value : o.estimated_value)}</span>
                      <div className="w-36">
                        <SelectField
                          aria-label={`Stage of ${o.title}`}
                          value={o.stage_key}
                          className="h-8"
                          onChange={(v) =>
                            v &&
                            stageChange.request(
                              { id: o.id, title: o.title, company: lead.company_name, stage: o.stage_key, estimatedValue: Number(o.estimated_value) },
                              v,
                            )
                          }
                          options={lists.stages.map((s) => ({ value: s.key, label: s.label }))}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel>
              <PanelHeader title="Details" actions={<Button variant="ghost" size="sm" onClick={openEdit}>Edit</Button>} />
              {/* Every row edits in place: click the value (or "Not set"), change it, Enter or Save. */}
              <dl className="grid grid-cols-[120px_1fr] items-start gap-x-3 gap-y-2 p-4 text-body">
                <DetailField {...df("website", "Website")} kind="text" placeholder="brightsmile.com" display={lead.domain ?? lead.website} />
                <DetailField {...df("company_linkedin_url", "Company LinkedIn")} kind="text" placeholder="linkedin.com/company/…" />
                <DetailField {...df("company_phone", "Company phone")} kind="text" display={formatPhone(lead.company_phone)} />
                <DetailField {...df("company_email", "Email")} kind="text" />
                <DetailField {...df("company_size", "Company size")} kind="select" noneLabel="Not set" options={COMPANY_SIZES.map((s) => ({ value: s, label: s }))} />
                <DetailField {...df("niche_id", "Niche")} kind="select" options={activeOpts(lists.niches, lead.niche_id)} display={nameOf(lists.niches, lead.niche_id)} />
                <DetailField {...df("sub_niche", "Sub-niche")} kind="text" placeholder="Pediatric dentistry" />
                <DetailField {...df("channel_id", "Channel")} kind="select" options={activeOpts(lists.channels, lead.channel_id)} display={nameOf(lists.channels, lead.channel_id)} />
                <DetailField {...df("source_id", "Source")} kind="select" noneLabel="Not set" options={activeOpts(lists.sources, lead.source_id)} display={nameOf(lists.sources, lead.source_id)} />
                <DetailField
                  {...df("campaign_id", "Campaign")}
                  kind="select"
                  noneLabel="No campaign"
                  options={lists.campaigns
                    .filter((c) => (c.status === "active" && (!c.niche_id || c.niche_id === lead.niche_id)) || c.id === lead.campaign_id)
                    .map((c) => ({ value: c.id, label: c.name }))}
                  display={nameOf(lists.campaigns, lead.campaign_id)}
                />
                <DetailField {...df("address", "Address")} kind="text" />
                <DetailField {...df("city", "City")} kind="text" />
                <DetailField {...df("state_region", "State or region")} kind="text" placeholder="TX" />
                <DetailField {...df("country", "Country")} kind="combobox" options={COUNTRIES.map((c) => ({ value: c.name, label: c.name }))} searchPlaceholder="Search countries" />
                <DetailField
                  {...df("lead_timezone", "Time zone")}
                  kind="combobox"
                  clearLabel="Not set"
                  options={timeZoneList().map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }))}
                  searchPlaceholder="Search time zones"
                  display={lead.lead_timezone?.replace(/_/g, " ")}
                />
                <DetailField {...df("google_maps_url", "Google Maps")} kind="text" placeholder="maps.app.goo.gl/…" />
                <DetailField {...df("google_rating", "Google rating")} kind="text" inputMode="decimal" placeholder="4.7" />
                <DetailField {...df("google_review_count", "Review count")} kind="text" inputMode="numeric" placeholder="212" />
                <DetailField {...df("pain_point", "Pain point")} kind="textarea" placeholder="What problem do they likely have?" />
                <DetailField {...df("offer", "Offer")} kind="textarea" placeholder="What we'd sell them." />
                <DetailField
                  {...df("tags", "Tags")}
                  kind="tags"
                  placeholder="texas, pediatric"
                  display={lead.tags.length ? lead.tags.map((t) => <Chip key={t} className="mr-1">{t}</Chip>) : null}
                />
                <DetailField {...df("notes", "Notes")} kind="textarea" display={lead.notes && <span className="whitespace-pre-line">{lead.notes}</span>} />
                <Detail label="Owner">{memberName(lead.owner_id)}</Detail>
                <Detail label="Added">
                  {memberName(lead.created_by)}, {formatDateTime(lead.created_at, profile.timezone)}
                </Detail>
                {lead.import_batch_id && (
                  <Detail label="Imported">
                    <span data-testid="lead-import-info">
                      {detail.importBatch
                        ? `From ${detail.importBatch.filename} (${detail.importBatch.code})`
                        : "From a CSV import"}
                    </span>
                  </Detail>
                )}
              </dl>
            </Panel>

            {isFounder && (
              <Panel>
                <PanelHeader title="Ownership history" />
                <ol className="divide-y divide-line">
                  {ownerEvents.map((e) => (
                    <li key={e.id} className="px-4 py-2.5 text-body">
                      <div>{e.from_owner ? `${memberName(e.from_owner)} to ${memberName(e.to_owner)}` : `Owned by ${memberName(e.to_owner)}`}</div>
                      <div className="num text-small text-ink-muted">
                        {formatDateTime(e.changed_at, profile.timezone)}
                        {e.changed_by && `, by ${memberName(e.changed_by)}`}
                      </div>
                    </li>
                  ))}
                </ol>
              </Panel>
            )}
          </div>
        </div>
      </div>

      {stageChange.dialogs}
      <OpportunitySheet id={openOpp} onClose={() => setOpenOpp(null)} />
      {dialog === "flag" && (
        <FlagLeadDialog leadId={lead.id} companyName={lead.company_name} ownerName={memberName(lead.owner_id)} onClose={() => setDialog(null)} />
      )}
      {dialog === "opportunity" && (
        <CreateOpportunityDialog
          leadId={lead.id}
          companyName={lead.company_name}
          title="New opportunity"
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "reassign" && (
        <ReassignDialog
          currentOwner={lead.owner_id}
          onClose={() => setDialog(null)}
          pending={pending}
          onConfirm={(toId) =>
            run(() => reassignLeads({ ids: [lead.id], toId }), `Lead reassigned to ${memberName(toId)}`, () => setDialog(null))
          }
        />
      )}
      {dialog === "delete" && (
        <DeleteDialog
          companyName={lead.company_name}
          onClose={() => setDialog(null)}
          pending={pending}
          onConfirm={(confirmName, setError) =>
            startTransition(async () => {
              const res = await deleteLead({ id: lead.id, confirmName });
              if (!res.ok) {
                setError(res.fieldErrors?.confirmName ?? res.error);
                return;
              }
              toast.success("Lead deleted");
              router.push("/leads");
              router.refresh();
            })
          }
        />
      )}
    </>
  );
}

function ExternalA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-ink">
      {children}
      <ExternalLink className="size-3" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <>
      <dt className="text-small text-ink-muted">{label}</dt>
      <dd className={cn("min-w-0 break-words", empty && "text-ink-muted")}>{empty ? "Not set" : children}</dd>
    </>
  );
}

function ReassignDialog({
  currentOwner,
  onClose,
  onConfirm,
  pending,
}: {
  currentOwner: string;
  onClose: () => void;
  onConfirm: (toId: string) => void;
  pending: boolean;
}) {
  const { lists } = useApp();
  const [toId, setToId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign lead</DialogTitle>
          <DialogDescription>Open opportunities move with the lead. Won and lost ones stay with the original owner.</DialogDescription>
        </DialogHeader>
        <FormField label="New owner" htmlFor="reassign-owner" error={error}>
          <SelectField
            id="reassign-owner"
            value={toId}
            onChange={setToId}
            placeholder="Pick a person"
            options={lists.salesMembers.filter((m) => m.is_active && m.id !== currentOwner).map((m) => ({ value: m.id, label: m.full_name || m.email }))}
            invalid={!!error}
          />
        </FormField>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => (toId ? onConfirm(toId) : setError("Pick the new owner."))}>
            Reassign lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  companyName,
  onClose,
  onConfirm,
  pending,
}: {
  companyName: string;
  onClose: () => void;
  onConfirm: (confirmName: string, setError: (e: string) => void) => void;
  pending: boolean;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {companyName}?</DialogTitle>
          <DialogDescription>
            Its contacts, activities and opportunities are deleted too. This can&apos;t be undone. Type the company name to confirm.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm(value, setError);
          }}
        >
          <FormField label="Company name" htmlFor="confirm-name" error={error}>
            <Input id="confirm-name" value={value} autoComplete="off" onChange={(e) => setValue(e.target.value)} aria-invalid={!!error} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" pending={pending} disabled={value.trim() !== companyName.trim()}>
              Delete lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

