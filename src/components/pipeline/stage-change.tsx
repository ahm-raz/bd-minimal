"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "@/components/app/nav-progress";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/common/form-field";
import { SelectField } from "@/components/common/select-field";
import { useApp } from "@/components/app/app-provider";
import { OPEN_STAGE_KEYS } from "@/lib/domain";
import { applyFieldErrors } from "@/lib/forms";
import { lostSchema, wonSchema, type LostValues, type WonValues } from "@/lib/validation/opportunity";
import { markLost, markWon, moveOpportunityStage } from "@/server/actions/opportunities";

export type StageTarget = { id: string; title: string; company: string; stage: string; estimatedValue: number };

type Pending =
  | { kind: "won"; opp: StageTarget }
  | { kind: "lost"; opp: StageTarget }
  | { kind: "reopen"; opp: StageTarget; to: string };

/**
 * Stage changes with the dialogs docs/07 section 7 requires:
 * Won asks for value and contract, Lost for a reason, and moving a closed card back to an open stage asks first.
 * `onSettled(ok)` tells the caller whether the move happened, so the board can roll back.
 */
export function useStageChange() {
  const [pending, setPending] = useState<(Pending & { onSettled?: (ok: boolean) => void }) | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const request = useCallback(
    (opp: StageTarget, to: string, onSettled?: (ok: boolean) => void) => {
      if (to === opp.stage) return onSettled?.(true);
      if (to === "won") return setPending({ kind: "won", opp, onSettled });
      if (to === "lost") return setPending({ kind: "lost", opp, onSettled });
      if (opp.stage === "won" || opp.stage === "lost") return setPending({ kind: "reopen", opp, to, onSettled });
      startTransition(async () => {
        const res = await moveOpportunityStage({ id: opp.id, stage: to });
        if (!res.ok) {
          toast.error(res.error);
          onSettled?.(false);
          return;
        }
        onSettled?.(true);
        router.refresh();
      });
    },
    [router],
  );

  const settle = (ok: boolean) => {
    pending?.onSettled?.(ok);
    setPending(null);
    if (ok) router.refresh();
  };

  const dialogs = (
    <>
      {pending?.kind === "won" && <WonDialog opp={pending.opp} onDone={settle} />}
      {pending?.kind === "lost" && <LostDialog opp={pending.opp} onDone={settle} />}
      {pending?.kind === "reopen" && <ReopenDialog opp={pending.opp} to={pending.to} onDone={settle} />}
    </>
  );
  return { request, dialogs };
}

function WonDialog({ opp, onDone }: { opp: StageTarget; onDone: (ok: boolean) => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const form = useForm<WonValues, unknown, z.output<typeof wonSchema>>({
    resolver: zodResolver(wonSchema),
    defaultValues: { id: opp.id, wonValue: String(opp.estimatedValue), monthlyAmount: "" },
  });
  const errors = form.formState.errors;
  const contract = useWatch({ control: form.control, name: "contractType" });
  return (
    <Dialog open onOpenChange={(o) => !o && onDone(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark {opp.title} as won</DialogTitle>
          <DialogDescription>{opp.company}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(() =>
            start(async () => {
              setFormError(null);
              const res = await markWon(form.getValues());
              if (!res.ok) {
                applyFieldErrors(form.setError, res.fieldErrors);
                if (!res.fieldErrors) setFormError(res.error);
                return;
              }
              toast.success(`${opp.company} marked as won`);
              onDone(true);
            }),
          )}
        >
          {formError && <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">{formError}</p>}
          <FormField label="Final value" htmlFor="won-value" required error={errors.wonValue?.message}>
            <Input id="won-value" inputMode="decimal" className="num" aria-invalid={!!errors.wonValue} {...form.register("wonValue")} />
          </FormField>
          <FormField label="Contract type" htmlFor="won-contract" required error={errors.contractType?.message}>
            <Controller
              control={form.control}
              name="contractType"
              render={({ field }) => (
                <SelectField
                  id="won-contract"
                  value={field.value ?? null}
                  onChange={(v) => field.onChange(v ?? undefined)}
                  placeholder="Pick a contract type"
                  options={[
                    { value: "one_time", label: "One-time" },
                    { value: "monthly", label: "Monthly" },
                  ]}
                  invalid={!!errors.contractType}
                />
              )}
            />
          </FormField>
          {contract === "monthly" && (
            <FormField label="Monthly amount" htmlFor="won-monthly" required error={errors.monthlyAmount?.message}>
              <Input id="won-monthly" inputMode="decimal" className="num" aria-invalid={!!errors.monthlyAmount} {...form.register("monthlyAmount")} />
            </FormField>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onDone(false)}>
              Cancel
            </Button>
            <Button type="submit" pending={busy}>
              Mark as won
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LostDialog({ opp, onDone }: { opp: StageTarget; onDone: (ok: boolean) => void }) {
  const { lists } = useApp();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const form = useForm<LostValues, unknown, z.output<typeof lostSchema>>({
    resolver: zodResolver(lostSchema),
    defaultValues: { id: opp.id, lostReasonId: "", lostNote: "" },
  });
  const errors = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onDone(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark {opp.title} as lost</DialogTitle>
          <DialogDescription>{opp.company}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(() =>
            start(async () => {
              setFormError(null);
              const res = await markLost(form.getValues());
              if (!res.ok) {
                applyFieldErrors(form.setError, res.fieldErrors);
                if (!res.fieldErrors) setFormError(res.error);
                return;
              }
              toast.success(`${opp.company} marked as lost`);
              onDone(true);
            }),
          )}
        >
          {formError && <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">{formError}</p>}
          <FormField label="Reason" htmlFor="lost-reason" required error={errors.lostReasonId?.message}>
            <Controller
              control={form.control}
              name="lostReasonId"
              render={({ field }) => (
                <SelectField
                  id="lost-reason"
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? "")}
                  placeholder="Pick a reason"
                  options={lists.lostReasons.filter((r) => r.is_active).map((r) => ({ value: r.id, label: r.name }))}
                  invalid={!!errors.lostReasonId}
                />
              )}
            />
          </FormField>
          <FormField label="Note" htmlFor="lost-note" error={errors.lostNote?.message}>
            <Textarea id="lost-note" rows={3} aria-invalid={!!errors.lostNote} {...form.register("lostNote")} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onDone(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" pending={busy}>
              Mark as lost
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReopenDialog({ opp, to, onDone }: { opp: StageTarget; to: string; onDone: (ok: boolean) => void }) {
  const { lists } = useApp();
  const [busy, start] = useTransition();
  const label = lists.stages.find((s) => s.key === to)?.label ?? to;
  if (!(OPEN_STAGE_KEYS as string[]).includes(to)) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onDone(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {opp.title} back to {label}?</DialogTitle>
          <DialogDescription>
            {opp.stage === "won"
              ? "This will remove it from won revenue."
              : "This reopens it and clears the lost reason."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onDone(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              start(async () => {
                const res = await moveOpportunityStage({ id: opp.id, stage: to });
                if (!res.ok) {
                  toast.error(res.error);
                  onDone(false);
                  return;
                }
                toast.success(`Moved to ${label}`);
                onDone(true);
              })
            }
          >
            Move to {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
