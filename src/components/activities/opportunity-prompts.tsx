"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [close, setClose] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

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
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await createOpportunity({ leadId, title, estimatedValue: value, expectedCloseDate: close || null });
              if (!res.ok) {
                setErrors(res.fieldErrors ?? { title: res.error });
                return;
              }
              toast.success("Opportunity created");
              onClose();
              router.refresh();
            });
          }}
        >
          <FormField label="Title" htmlFor="opp-title" required error={errors.title} helper="What we'd sell them.">
            <Input id="opp-title" autoFocus value={title} placeholder="AI patient intake setup" onChange={(e) => setTitle(e.target.value)} aria-invalid={!!errors.title} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Estimated value" htmlFor="opp-value" required error={errors.estimatedValue}>
              <Input id="opp-value" inputMode="decimal" placeholder="3500" className="num" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!!errors.estimatedValue} />
            </FormField>
            <FormField label="Expected close" htmlFor="opp-close" error={errors.expectedCloseDate}>
              <Input id="opp-close" type="date" value={close} onChange={(e) => setClose(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Not now
            </Button>
            <Button type="submit" disabled={pending}>
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
