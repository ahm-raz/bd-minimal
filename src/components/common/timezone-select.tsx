"use client";

import { useMemo } from "react";
import { useNow } from "@/lib/use-now";
import { localClock, timeZoneList } from "@/lib/dates";
import { Combobox } from "@/components/common/combobox";

/** Searchable IANA list, with the current local time shown (docs/07 section 13). */
export function TimezoneSelect({
  id,
  value,
  onChange,
  invalid,
  showPreview = true,
}: {
  id?: string;
  value: string;
  onChange: (tz: string) => void;
  invalid?: boolean;
  showPreview?: boolean;
}) {
  const options = useMemo(
    () => timeZoneList().map((tz) => ({ value: tz, label: tz.replace(/_/g, " "), keywords: [tz] })),
    [],
  );
  const now = useNow();

  return (
    <div className="flex flex-col gap-1.5">
      <Combobox
        id={id}
        value={value || null}
        onChange={(v) => v && onChange(v)}
        options={options}
        placeholder="Pick a time zone"
        searchPlaceholder="Search time zones"
        invalid={invalid}
      />
      {showPreview && value && now && (
        <p className="num text-small text-ink-muted" data-testid="tz-preview">
          Local time there: {localClock(value, now)}
        </p>
      )}
    </div>
  );
}
