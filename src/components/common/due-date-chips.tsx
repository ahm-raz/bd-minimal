"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { addDays, dueLabel, todayIn } from "@/lib/dates";
import { useProfile } from "@/components/app/profile-provider";

/** Quick date chips: Tomorrow, +3 days, +1 week, Pick date. Dates are the user's local dates (docs/04 section 3). */
export function DueDateChips({
  value,
  onChange,
  id,
  invalid,
  disabled,
}: {
  value: string | null | undefined;
  onChange: (date: string) => void;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const { timezone } = useProfile();
  const today = todayIn(timezone);
  const autoId = useId();
  const inputId = id ?? autoId;
  const chips = [
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: "+3 days", date: addDays(today, 3) },
    { label: "+1 week", date: addDays(today, 7) },
  ];
  const isChip = chips.some((c) => c.date === value);

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Due date">
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          disabled={disabled}
          aria-pressed={value === c.date}
          onClick={() => onChange(c.date)}
          className={cn(
            "h-7 rounded-md border px-2.5 text-small transition-colors disabled:opacity-50",
            value === c.date
              ? "border-accent-strong bg-accent-soft text-accent-strong"
              : "border-line bg-surface text-ink hover:bg-surface-muted",
          )}
        >
          {c.label}
        </button>
      ))}
      <label htmlFor={inputId} className="sr-only">
        Pick date
      </label>
      <input
        id={inputId}
        type="date"
        disabled={disabled}
        value={value ?? ""}
        min={today}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-7 rounded-md border bg-surface px-2 text-small text-ink outline-none focus-visible:outline-2 focus-visible:outline-accent-strong",
          value && !isChip ? "border-accent-strong" : "border-line",
          invalid && "border-bad",
        )}
      />
      {value && <span className="num text-small text-ink-muted">{dueLabel(value, today)}</span>}
    </div>
  );
}
