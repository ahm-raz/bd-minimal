"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/common/combobox";
import { SelectField } from "@/components/common/select-field";
import { parseLeadField, type LeadField, type LeadFieldValue } from "@/lib/validation/lead-field";
import { updateLeadField } from "@/server/actions/leads";

type Option = { value: string; label: string };

export type DetailFieldProps = {
  leadId: string;
  field: LeadField;
  label: string;
  /** The value as stored, used to start editing. */
  value: LeadFieldValue;
  /** How it's shown when not editing; empty shows "Not set". */
  display?: React.ReactNode;
  /** The lead's country, so phone numbers are read the same way the server reads them. */
  country?: string | null;
} & (
  | { kind: "text" | "textarea"; placeholder?: string; inputMode?: "decimal" | "numeric" }
  | { kind: "tags"; placeholder?: string }
  | { kind: "select"; options: Option[]; noneLabel?: string }
  | { kind: "combobox"; options: Option[]; clearLabel?: string; searchPlaceholder?: string }
);

/**
 * One row of the lead page's Details panel, editable in place: click the value, change it, Enter or Save.
 * Esc or Cancel leaves it as it was. Lists save as soon as an option is picked.
 */
export function DetailField(props: DetailFieldProps) {
  const { leadId, field, label, value, display, country } = props;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = `detail-${field}`;
  const empty = display === null || display === undefined || display === "" || (Array.isArray(value) && value.length === 0 && !display);

  const start = () => {
    setDraft(Array.isArray(value) ? value.join(", ") : value == null ? "" : String(value));
    setError(null);
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setError(null);
  };
  const save = (next: string) => {
    const raw = props.kind === "tags" ? next.split(",").map((t) => t.trim()).filter(Boolean) : next;
    const check = parseLeadField(field, raw, country);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    startTransition(async () => {
      const res = await updateLeadField({ leadId, field, value: raw });
      if (!res.ok) {
        setError(res.fieldErrors?.value ?? res.error);
        return;
      }
      toast.success(`${label} saved`);
      setEditing(false);
      router.refresh();
    });
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
    if (e.key === "Enter" && (props.kind !== "textarea" || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save(draft);
    }
  };

  let control: React.ReactNode;
  if (props.kind === "select") {
    control = (
      <SelectField
        id={inputId}
        aria-label={label}
        value={draft || null}
        onChange={(v) => {
          setDraft(v ?? "");
          save(v ?? "");
        }}
        options={props.options}
        noneLabel={props.noneLabel}
        invalid={!!error}
      />
    );
  } else if (props.kind === "combobox") {
    control = (
      <Combobox
        id={inputId}
        value={draft || null}
        onChange={(v) => {
          setDraft(v ?? "");
          save(v ?? "");
        }}
        options={props.options}
        allowClear={!!props.clearLabel}
        clearLabel={props.clearLabel}
        placeholder={props.clearLabel ?? "Pick one"}
        searchPlaceholder={props.searchPlaceholder}
        aria-label={label}
      />
    );
  } else if (props.kind === "textarea") {
    control = (
      <Textarea
        id={inputId}
        aria-label={label}
        autoFocus
        rows={3}
        value={draft}
        placeholder={props.placeholder}
        aria-invalid={!!error}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={keys}
      />
    );
  } else {
    control = (
      <Input
        id={inputId}
        aria-label={label}
        autoFocus
        value={draft}
        placeholder={props.placeholder}
        inputMode={props.kind === "text" ? props.inputMode : undefined}
        aria-invalid={!!error}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={keys}
      />
    );
  }

  return (
    <>
      <dt className={cn("text-small text-ink-muted", editing ? "pt-2" : "pt-0.5")}>
        {editing ? <label htmlFor={inputId}>{label}</label> : label}
      </dt>
      <dd className="min-w-0" data-testid={`detail-${field}`}>
        {editing ? (
          <div className="flex flex-col gap-1.5" onKeyDown={props.kind === "select" || props.kind === "combobox" ? keys : undefined}>
            {control}
            {error && (
              <p role="alert" className="text-small text-bad">
                {error}
              </p>
            )}
            <div className="flex items-center gap-2">
              {props.kind !== "select" && props.kind !== "combobox" && (
                <Button type="button" size="sm" disabled={pending} onClick={() => save(draft)}>
                  Save
                </Button>
              )}
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={cancel}>
                Cancel
              </Button>
              {props.kind === "textarea" && <span className="text-micro font-normal text-ink-faint">Ctrl+Enter to save</span>}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={start}
            aria-label={`Edit ${label}`}
            className="group -mx-1.5 flex w-[calc(100%+0.75rem)] items-start gap-2 rounded-md px-1.5 py-0.5 text-left hover:bg-surface-muted"
          >
            <span className={cn("min-w-0 flex-1 break-words", empty && "text-ink-muted")}>
              {empty ? "Not set" : display}
            </span>
            <Pencil className="mt-0.5 size-3.5 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
          </button>
        )}
      </dd>
    </>
  );
}
