"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Input that saves on blur or Enter; Esc restores the saved value.
 * `onCommit` only fires when the trimmed value actually changed.
 */
export function InlineInput({
  value,
  onCommit,
  label,
  className,
  type = "text",
  allowEmpty = false,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "onBlur"> & {
  value: string;
  onCommit: (value: string) => void;
  label: string;
  allowEmpty?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [last, setLast] = useState(value);
  if (last !== value) {
    setLast(value);
    setDraft(value);
  }
  return (
    <Input
      {...props}
      type={type}
      aria-label={label}
      value={draft}
      className={cn("h-8", className)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (!next && !allowEmpty) {
          setDraft(value);
          return;
        }
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
