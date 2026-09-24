"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { StageChip } from "@/components/common/chips";
import { ErrorState } from "@/components/common/empty-state";
import { FormField } from "@/components/common/form-field";
import { FormSheet } from "@/components/common/form-sheet";
import { SelectField } from "@/components/common/select-field";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { CONTRACT_TYPE_LABELS } from "@/lib/domain";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { getOpportunityDetail, updateOpportunity, type OpportunityDetail } from "@/server/actions/opportunities";
import { useStageChange } from "./stage-change";

/** Opportunity side panel: details (editable), stage with history, link to the lead (docs/07 section 7). */
export function OpportunitySheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  if (!id) return null;
  return <OpportunitySheetBody key={id} id={id} onClose={onClose} />;
}

function OpportunitySheetBody({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<OpportunityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    void getOpportunityDetail(id).then((res) => {
      if (!live) return;
      if (res.ok) setDetail(res.data);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [id, version]);

  if (!detail) {
    return (
      <FormSheet open onOpenChange={(o) => !o && onClose()} title="Opportunity">
        {error ? (
          <ErrorState>{error} Close the panel and try again.</ErrorState>
        ) : (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
      </FormSheet>
    );
  }
  return <OpportunityForm key={`${detail.id}-${version}`} detail={detail} onClose={onClose} onChanged={() => setVersion((v) => v + 1)} />;
}

function OpportunityForm({ detail, onClose, onChanged }: { detail: OpportunityDetail; onClose: () => void; onChanged: () => void }) {
  const { lists } = useApp();
  const { timezone } = useProfile();
  const router = useRouter();
  const stageChange = useStageChange();
  const [title, setTitle] = useState(detail.title);
  const [value, setValue] = useState(String(detail.estimatedValue));
  const [close, setClose] = useState(detail.expectedCloseDate ?? "");
  const [notes, setNotes] = useState(detail.notes ?? "");
  const [ended, setEnded] = useState(detail.contractEndedAt ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const dirty =
    title !== detail.title ||
    value !== String(detail.estimatedValue) ||
    close !== (detail.expectedCloseDate ?? "") ||
    notes !== (detail.notes ?? "") ||
    ended !== (detail.contractEndedAt ?? "");
  const stageLabel = (k: string | null) => lists.stages.find((s) => s.key === k)?.label ?? k ?? "";
  const member = (id: string | null) => lists.members.find((m) => m.id === id)?.full_name || "Someone";

  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={detail.title}
      description={
        <Link href={`/leads/${detail.leadId}`} className="text-accent-strong hover:underline" onClick={onClose}>
          {detail.company}
        </Link>
      }
      dirty={dirty}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" form="opp-form" disabled={pending || !dirty}>
            Save opportunity
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <FormField label="Stage" htmlFor="opp-stage" className="w-56">
            <SelectField
              id="opp-stage"
              value={detail.stage}
              onChange={(v) =>
                v &&
                stageChange.request(
                  { id: detail.id, title: detail.title, company: detail.company, stage: detail.stage, estimatedValue: detail.estimatedValue },
                  v,
                  (ok) => ok && onChanged(),
                )
              }
              options={lists.stages.map((s) => ({ value: s.key, label: s.label }))}
            />
          </FormField>
          {detail.stage === "won" && (
            <p className="num text-small text-ink-muted">
              Won {formatMoney(detail.wonValue)}, {detail.contractType ? CONTRACT_TYPE_LABELS[detail.contractType] : ""}
              {detail.contractType === "monthly" && ` ${formatMoney(detail.monthlyAmount)} a month`}
            </p>
          )}
          {detail.stage === "lost" && (
            <p className="text-small text-ink-muted">
              Lost: {detail.lostReason}
              {detail.lostNote && `. ${detail.lostNote}`}
            </p>
          )}
        </div>

        <form
          id="opp-form"
          noValidate
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await updateOpportunity({
                id: detail.id,
                title,
                estimatedValue: value,
                expectedCloseDate: close || null,
                notes,
                contractEndedAt: ended || null,
              });
              if (!res.ok) {
                setErrors(res.fieldErrors ?? { _form: res.error });
                return;
              }
              toast.success("Opportunity saved");
              router.refresh();
              onChanged();
            });
          }}
        >
          {errors._form && <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad sm:col-span-2">{errors._form}</p>}
          <FormField label="Title" htmlFor="opp-edit-title" required error={errors.title} className="sm:col-span-2">
            <Input id="opp-edit-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} />
          </FormField>
          <FormField label="Estimated value" htmlFor="opp-edit-value" required error={errors.estimatedValue}>
            <Input id="opp-edit-value" inputMode="decimal" className="num" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!!errors.estimatedValue} />
          </FormField>
          <FormField label="Expected close" htmlFor="opp-edit-close" error={errors.expectedCloseDate}>
            <Input id="opp-edit-close" type="date" value={close} onChange={(e) => setClose(e.target.value)} />
          </FormField>
          {detail.stage === "won" && detail.contractType === "monthly" && (
            <FormField label="Contract ended" htmlFor="opp-edit-ended" helper="Set when the monthly contract stops. It then leaves active MRR." error={errors.contractEndedAt}>
              <Input id="opp-edit-ended" type="date" value={ended} onChange={(e) => setEnded(e.target.value)} />
            </FormField>
          )}
          <FormField label="Notes" htmlFor="opp-edit-notes" className="sm:col-span-2">
            <Textarea id="opp-edit-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
        </form>

        <section aria-label="Stage history">
          <h3 className="mb-2 text-section text-ink">Stage history</h3>
          <ol className="divide-y divide-line rounded-lg border border-line" data-testid="stage-history">
            {detail.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-body">
                {h.from ? (
                  <>
                    <StageChip stage={h.from} label={stageLabel(h.from)} />
                    <span className="text-small text-ink-muted">to</span>
                  </>
                ) : (
                  <span className="text-small text-ink-muted">Created in</span>
                )}
                <StageChip stage={h.to} label={stageLabel(h.to)} />
                <span className="num ml-auto text-small text-ink-muted">
                  {formatDateTime(h.at, timezone)}, {member(h.by)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      {stageChange.dialogs}
    </FormSheet>
  );
}
