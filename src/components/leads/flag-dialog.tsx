"use client";

import { useTransition } from "react";
import { useRouter } from "@/components/app/nav-progress";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { flagLeadSchema, type FlagLeadValues } from "@/lib/validation/task";
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
  const [pending, startTransition] = useTransition();
  const form = useForm<FlagLeadValues>({ resolver: zodResolver(flagLeadSchema), defaultValues: { leadId, note: "" } });
  const error = form.formState.errors.note?.message;
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
          noValidate
          onSubmit={form.handleSubmit(() =>
            startTransition(async () => {
              const res = await flagLead(form.getValues());
              if (!res.ok) {
                form.setError("note", { type: "server", message: res.fieldErrors?.note ?? res.error }, { shouldFocus: true });
                return;
              }
              toast.success(`Lead flagged. ${ownerName} has a fix task for today.`);
              onClose();
              router.refresh();
            }),
          )}
        >
          <FormField label="What needs fixing" htmlFor="flag-note" required error={error}>
            <Textarea
              id="flag-note"
              rows={3}
              autoFocus
              placeholder="Need the owner's name and direct email."
              aria-invalid={!!error}
              {...form.register("note")}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" pending={pending}>
              Flag lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
