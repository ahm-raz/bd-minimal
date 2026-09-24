"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Flag, MapPin, MoreHorizontal, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { LEAD_STATUSES, LEAD_STATUS_LABELS, PRIORITIES, PRIORITY_LABELS, type LeadPriority, type LeadStatus } from "@/lib/domain";
import { completenessTone } from "@/lib/completeness";
import { formatDateTime } from "@/lib/dates";
import { formatMoney, formatPhone } from "@/lib/format";
import type { LeadFormValues } from "@/lib/validation/lead";
import { deleteLead, reassignLeads, setLeadPriority, setLeadStatus } from "@/server/actions/leads";
import type { LeadDetail } from "@/server/queries/lead-detail";

export function LeadPage({ detail, formValues }: { detail: LeadDetail; formValues: LeadFormValues }) {
  const { lead, contacts, ownerEvents, openFlags, opportunities, activities, stageEvents } = detail;
  const { lists, openEditLead, openLogActivity, setCurrentLeadId } = useApp();
  const profile = useProfile();
  const isFounder = profile.role === "founder";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<null | "reassign" | "delete" | "opportunity">(null);

  // The L shortcut logs against this lead while the page is open.
  useEffect(() => {
    setCurrentLeadId(lead.id);
    return () => setCurrentLeadId(null);
  }, [lead.id, setCurrentLeadId]);
  const logActivity = () => openLogActivity({ leadId: lead.id });

  const nameOf = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name ?? "";
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
      <Link href="/leads" className="mb-3 inline-flex items-center gap-1 text-small text-ink-muted hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden /> Leads
      </Link>

      <header className="mb-6 flex flex-col gap-2">
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
            <Chip tone="bad" title={openFlags.map((f) => f.note).filter(Boolean).join("\n")} data-testid="flag-badge">
              <Flag className="size-3" aria-hidden /> Flagged
            </Chip>
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-6">
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

        <div className="flex min-w-0 flex-col gap-6">
          <ContactsPanel leadId={lead.id} contacts={contacts} country={lead.country} />

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
                  <li key={o.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <span className="min-w-0 truncate">{o.title}</span>
                    <span className="num text-ink-muted">{formatMoney(o.estimated_value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Details" actions={<Button variant="ghost" size="sm" onClick={openEdit}>Edit</Button>} />
            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 p-4 text-body">
              <Detail label="Niche">{nameOf(lists.niches, lead.niche_id)}</Detail>
              <Detail label="Sub-niche">{lead.sub_niche}</Detail>
              <Detail label="Channel">{nameOf(lists.channels, lead.channel_id)}</Detail>
              <Detail label="Campaign">{nameOf(lists.campaigns, lead.campaign_id)}</Detail>
              <Detail label="Source">{nameOf(lists.sources, lead.source_id)}</Detail>
              <Detail label="Company size">{lead.company_size}</Detail>
              <Detail label="Email">{lead.company_email && <a href={`mailto:${lead.company_email}`} className="hover:underline">{lead.company_email}</a>}</Detail>
              <Detail label="Address">{[lead.address, place, lead.country].filter(Boolean).join(", ")}</Detail>
              <Detail label="Pain point">{lead.pain_point}</Detail>
              <Detail label="Offer">{lead.offer}</Detail>
              <Detail label="Tags">{lead.tags.length ? lead.tags.map((t) => <Chip key={t} className="mr-1">{t}</Chip>) : null}</Detail>
              <Detail label="Notes">{lead.notes && <span className="whitespace-pre-line">{lead.notes}</span>}</Detail>
              <Detail label="Owner">{memberName(lead.owner_id)}</Detail>
              <Detail label="Added">
                {memberName(lead.created_by)}, {formatDateTime(lead.created_at, profile.timezone)}
              </Detail>
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
      <dd className={cn("min-w-0 break-words", empty && "text-ink-faint")}>{empty ? "Not set" : children}</dd>
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
            options={lists.members.filter((m) => m.is_active && m.id !== currentOwner).map((m) => ({ value: m.id, label: m.full_name || m.email }))}
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
            <Button type="submit" variant="destructive" disabled={pending || value.trim() !== companyName.trim()}>
              Delete lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
