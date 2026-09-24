"use client";

import { localClock } from "@/lib/dates";
import { useNow } from "@/lib/use-now";

/** "Local time 9:14 AM (Austin)": helps BDs call during the prospect's office hours (docs/04 section 8). */
export function LeadLocalTime({ tz, city }: { tz: string; city: string | null }) {
  const now = useNow();
  if (!now) return null;
  return (
    <span className="num text-small text-ink-muted" data-testid="lead-local-time">
      Local time <span className="font-medium text-ink">{localClock(tz, now)}</span>
      {city && ` (${city})`}
    </span>
  );
}
