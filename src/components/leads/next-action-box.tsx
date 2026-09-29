"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DueDateChips } from "@/components/common/due-date-chips";
import { FormField } from "@/components/common/form-field";
import { useProfile } from "@/components/app/profile-provider";
import { dueLabel, dueState, formatLocalDate, todayIn } from "@/lib/dates";
import { updateNextAction } from "@/server/actions/leads";

/** Next action box on the lead page: edit inline; "Done, log it" opens Log activity (docs/07 section 5). */
export function NextActionBox({
  leadId,
  nextAction,
  nextActionDue,
  onLog,
}: {
  leadId: string;
  nextAction: string | null;
  nextActionDue: string | null;
  onLog?: () => void;
}) {
  const { timezone } = useProfile();
  const router = useRouter();
  const today = todayIn(timezone);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(nextAction ?? "");
  const [due, setDue] = useState<string | null>(nextActionDue);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const state = dueState(nextActionDue, today);

  const save = (clear = false) =>
    startTransition(async () => {
      const res = await updateNextAction({ leadId, nextAction: clear ? "" : text, nextActionDue: clear ? null : due });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      setErrors({});
      setEditing(false);
      toast.success(clear ? "Next action cleared" : "Next action saved");
      router.refresh();
    });

  if (editing) {
    return (
      <section className="rounded-lg border border-line bg-surface p-4" aria-label="Next action">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <FormField label="Next action" htmlFor="na-text" error={errors.nextAction}>
            <Input id="na-text" value={text} autoFocus onChange={(e) => setText(e.target.value)} placeholder="Send case study" />
          </FormField>
          <FormField label="Due" htmlFor="na-due" error={errors.nextActionDue}>
            <DueDateChips id="na-due" value={due} onChange={setDue} invalid={!!errors.nextActionDue} />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" pending={pending}>
              Save next action
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            {nextAction && (
              <Button type="button" variant="ghost" className="ml-auto" disabled={pending} onClick={() => save(true)}>
                Clear next action
              </Button>
            )}
          </div>
        </form>
      </section>
    );
  }

  return (
    <section
      aria-label="Next action"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border bg-surface px-4 py-3",
        state === "overdue" ? "border-bad/40" : state === "today" ? "border-warn/40" : "border-line",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-small text-ink-muted">Next action</div>
        {nextAction ? (
          <div className="text-body text-ink">
            {nextAction}
            {nextActionDue && (
              <span
                className={cn("num ml-2", state === "overdue" ? "text-bad" : state === "today" ? "text-warn" : "text-ink-muted")}
                title={formatLocalDate(nextActionDue)}
              >
                {state === "overdue" ? `Overdue, ${dueLabel(nextActionDue, today)}` : dueLabel(nextActionDue, today)}
              </span>
            )}
          </div>
        ) : (
          <div className="text-body text-ink-muted">No next action. Plan the next step.</div>
        )}
      </div>
      <Button variant="secondary" onClick={() => setEditing(true)}>
        {nextAction ? "Edit" : "Add next action"}
      </Button>
      {onLog && nextAction && <Button onClick={onLog}>Done, log it</Button>}
    </section>
  );
}
