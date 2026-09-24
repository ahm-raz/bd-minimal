"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { flagLead } from "@/server/actions/tasks";

/** Flag lead (founder): note required; creates a lead-fix task for the owner due today (docs/04 section 7). */
export function FlagLeadDialog({
  leadId,
  companyName,
  ownerName,
  onClose,
}: {
  leadId: string;
  companyName: string;
  ownerName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Flag {companyName}</DialogTitle>
          <DialogDescription>
            {ownerName} gets a lead-fix task due today. The lead shows a red flag until it&apos;s done.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim().length < 3) return setError("Say what needs fixing.");
            startTransition(async () => {
              const res = await flagLead({ leadId, note });
              if (!res.ok) {
                setError(res.fieldErrors?.note ?? res.error);
                return;
              }
              toast.success(`Lead flagged. ${ownerName} has a fix task for today.`);
              onClose();
              router.refresh();
            });
          }}
        >
          <FormField label="What needs fixing" htmlFor="flag-note" required error={error}>
            <Textarea
              id="flag-note"
              rows={3}
              autoFocus
              value={note}
              placeholder="Need the owner's name and direct email."
              onChange={(e) => setNote(e.target.value)}
              aria-invalid={!!error}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Flag lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
