"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ComboOption = { value: string; label: string; hint?: string; keywords?: string[] };

/** Searchable select (docs/06: Combobox). Keyboard: type to filter, arrows, Enter. */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  invalid,
  disabled,
  className,
  allowClear,
  clearLabel = "None",
  defaultOpen = false,
  onOpenChange,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  allowClear?: boolean;
  clearLabel?: string;
  /** Open the list straight away (e.g. an in-place editor). */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  "aria-label"?: string;
}) {
  const [open, setOpenState] = useState(defaultOpen);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="secondary"
          size="form"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "w-full justify-between px-3 font-normal aria-invalid:border-bad",
            !selected && "text-ink-muted",
            className,
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="text-ink-muted" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {allowClear && (
                <CommandItem
                  value={`__none__ ${clearLabel}`}
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", value === null ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="text-ink-muted">{clearLabel}</span>
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.value} ${(o.keywords ?? []).join(" ")}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", value === o.value ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="ml-auto text-small text-ink-muted">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
