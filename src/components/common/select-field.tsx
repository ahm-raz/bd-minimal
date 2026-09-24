"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NONE = "__none__";

export type SelectOption = { value: string; label: string; disabled?: boolean };

/** Plain select for short lists. `noneLabel` adds an empty choice that maps to null. */
export function SelectField({
  id,
  value,
  onChange,
  options,
  placeholder = "Select",
  noneLabel,
  invalid,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  options: SelectOption[];
  placeholder?: string;
  noneLabel?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Select
      value={value ?? (noneLabel ? NONE : "")}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        className={cn("w-full bg-surface", className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {noneLabel && (
          <SelectItem value={NONE}>
            <span className="text-ink-muted">{noneLabel}</span>
          </SelectItem>
        )}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
