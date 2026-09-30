"use client";

import { useTransition } from "react";
import { useRouter } from "@/components/app/nav-progress";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/common/form-field";
import { applyFieldErrors } from "@/lib/forms";
import { createOpportunitySchema, type CreateOpportunityValues } from "@/lib/validation/opportunity";
import { createOpportunity, moveOpportunityStage } from "@/server/actions/opportunities";

/** "Create an opportunity for Bright Smile Dental?" after logging Meeting booked (docs/04 section 3). */
export function CreateOpportunityDialog({
  leadId,
  companyName,
  onClose,
  title: dialogTitle,
}: {
  leadId: string;
  companyName: string;
  onClose: () => void;
  title?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<CreateOpportunityValues, unknown, z.output<typeof createOpportunitySchema>>({
    resolver: zodResolver(createOpportunitySchema),
    defaultValues: { leadId, title: "", estimatedValue: "", expectedCloseDate: "" },
  });
  const errors = form.formState.errors;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle ?? `Create an opportunity for ${companyName}?`}</DialogTitle>
          <DialogDescription>It appears on the pipeline board as Qualified.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit(() =>
            startTransition(async () => {
              const v = form.getValues();
              const res = await createOpportunity({ ...v, expectedCloseDate: v.expectedCloseDate || null });
              if (!res.ok) {
                applyFieldErrors(form.setError, res.fieldErrors ?? { title: res.error });
                return;
              }
              toast.success("Opportunity created");
              onClose();
              router.refresh();
            }),
          )}
        >
          <FormField label="Title" htmlFor="opp-title" required error={errors.title?.message} helper="What we'd sell them.">
            <Input id="opp-title" autoFocus placeholder="AI patient intake setup" aria-invalid={!!errors.title} {...form.register("title")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Estimated value" htmlFor="opp-value" required error={errors.estimatedValue?.message}>
              <Input id="opp-value" inputMode="decimal" placeholder="3500" className="num" aria-invalid={!!errors.estimatedValue} {...form.register("estimatedValue")} />
            </FormField>
            <FormField label="Expected close" htmlFor="opp-close" error={errors.expectedCloseDate?.message}>
              <Input id="opp-close" type="date" aria-invalid={!!errors.expectedCloseDate} {...form.register("expectedCloseDate")} />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Not now
            </Button>
            <Button type="submit" pending={pending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Logging "Proposal sent" on a lead with one open opportunity offers to move it (docs/04 section 3). */
export function ProposalMoveDialog({ opportunity, onClose }: { opportunity: { id: string; title: string }; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {opportunity.title} to Proposal sent?</DialogTitle>
          <DialogDescription>The pipeline counts proposals from this stage.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Not now
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await moveOpportunityStage({ id: opportunity.id, stage: "proposal_sent" });
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Moved to Proposal sent");
                onClose();
                router.refresh();
              })
            }
          >
            Move to Proposal sent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
