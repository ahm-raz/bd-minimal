import { formatRelative } from "@/lib/dates";

/**
 * A timestamp shown relative to now ("2 min ago") in the viewer's time zone.
 * Server and browser render it a moment apart, so a label can differ at a boundary;
 * suppressHydrationWarning lets the browser's value win without a hydration error.
 */
export function RelativeTime({ at, tz, className }: { at: string; tz: string; className?: string }) {
  return (
    <time dateTime={at} className={className} suppressHydrationWarning>
      {formatRelative(at, tz)}
    </time>
  );
}
