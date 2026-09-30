"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/components/app/nav-progress";
import { Check, Pencil } from "lucide-react";
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
 * One row of the lead page's Details panel, editable in place.
 * - Text: click the value, type, then Enter or ✓. Esc, or moving focus out of the box, cancels.
 * - Lists: clicking the value opens the list; picking saves, closing it without a pick cancels.
 */
export function DetailField(props: DetailFieldProps) {
  const { leadId, field, label, value, display, country } = props;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** Set when a list option is picked, so the list closing right after doesn't count as a cancel. */
  const picked = useRef(false);
  const inputId = `detail-${field}`;
  const isList = props.kind === "select" || props.kind === "combobox";
  const empty = display === null || display === undefined || display === "";

  const start = () => {
    setDraft(Array.isArray(value) ? value.join(", ") : value == null ? "" : String(value));
    setError(null);
    picked.current = false;
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setError(null);
  };
  const save = (next: string) => {
    const raw = props.kind === "tags" ? next.split(",").map((t) => t.trim()).filter(Boolean) : next;
    // A list has already closed when this runs, so its errors go to a toast and the row closes.
    const fail = (message: string) => {
      if (isList) {
        toast.error(message);
        cancel();
      } else {
        setError(message);
      }
    };
    const check = parseLeadField(field, raw, country);
    if (!check.ok) {
      fail(check.error);
      return;
    }
    startTransition(async () => {
      const res = await updateLeadField({ leadId, field, value: raw });
      if (!res.ok) {
        fail(res.fieldErrors?.value ?? res.error);
        return;
      }
      toast.success(`${label} saved`);
      setEditing(false);
      router.refresh();
    });
  };

  // Lists: the dropdown is the whole editor.
  const pick = (v: string | null) => {
    picked.current = true;
    setDraft(v ?? "");
    save(v ?? "");
  };
  const onListOpenChange = (open: boolean) => {
    if (!open && !picked.current) cancel();
  };

  // Text: leaving the box (focus moves outside it) cancels; the ✓ keeps focus inside, so it doesn't.
  const onBoxBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (pending || e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    cancel();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    } else if (e.key === "Enter" && (props.kind !== "textarea" || e.ctrlKey || e.metaKey)) {
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
        onChange={pick}
        options={props.options}
        noneLabel={props.noneLabel}
        invalid={!!error}
        defaultOpen
        onOpenChange={onListOpenChange}
      />
    );
  } else if (props.kind === "combobox") {
    control = (
      <Combobox
        id={inputId}
        aria-label={label}
        value={draft || null}
        onChange={pick}
        options={props.options}
        allowClear={!!props.clearLabel}
        clearLabel={props.clearLabel}
        placeholder={props.clearLabel ?? "Pick one"}
        searchPlaceholder={props.searchPlaceholder}
        invalid={!!error}
        defaultOpen
        onOpenChange={onListOpenChange}
      />
    );
  } else {
    const shared = {
      id: inputId,
      "aria-label": label,
      autoFocus: true,
      value: draft,
      placeholder: props.placeholder,
      "aria-invalid": !!error,
      onKeyDown,
    };
    control =
      props.kind === "textarea" ? (
        <Textarea {...shared} rows={3} onChange={(e) => setDraft(e.target.value)} />
      ) : (
        <Input {...shared} inputMode={props.kind === "text" ? props.inputMode : undefined} onChange={(e) => setDraft(e.target.value)} />
      );
  }

  return (
    <>
      <dt className={cn("text-small text-ink-muted", editing ? "pt-2" : "pt-0.5")}>
        {editing ? <label htmlFor={inputId}>{label}</label> : label}
      </dt>
      <dd className="min-w-0" data-testid={`detail-${field}`}>
        {editing ? (
          <div className="flex flex-col gap-1.5" onBlur={isList ? undefined : onBoxBlur}>
            <div className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">{control}</div>
              {!isList && (
                <Button
                  type="button"
                  size="icon"
                  disabled={pending}
                  aria-label={`Save ${label}`}
                  title="Save"
                  // Keep focus in the field so pressing ✓ isn't read as leaving the box.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => save(draft)}
                >
                  <Check />
                </Button>
              )}
            </div>
            {error && (
              <p role="alert" className="text-small text-bad">
                {error}
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={start}
            aria-label={`Edit ${label}`}
            className="group -mx-1.5 flex w-[calc(100%+0.75rem)] items-start gap-2 rounded-md px-1.5 py-0.5 text-left hover:bg-surface-muted"
          >
            <span className={cn("min-w-0 flex-1 break-words", empty && "text-ink-muted")}>{empty ? "Not set" : display}</span>
            <Pencil
              className="mt-0.5 size-3.5 shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              aria-hidden
            />
          </button>
        )}
      </dd>
    </>
  );
}
