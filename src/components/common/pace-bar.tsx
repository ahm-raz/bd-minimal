import { cn } from "@/lib/utils";
import { formatNumber, formatPercent } from "@/lib/format";
import { paceState, type PaceState } from "@/lib/metrics";

const FILL: Record<PaceState | "none", string> = {
  ahead: "bg-ok",
  behind: "bg-warn",
  far_behind: "bg-bad",
  none: "bg-accent-strong",
};

const STATE_LABEL: Record<PaceState, string> = {
  ahead: "on pace",
  behind: "slightly behind pace",
  far_behind: "behind pace",
};

/**
 * The signature element (docs/06 section 1): actual vs target with a thin marker
 * where the person should be by now. 6px track, 2px ink marker, "58 / 112" left, "52%" right.
 */
export function PaceBar({
  actual,
  target,
  pace,
  label,
  className,
  compact = false,
}: {
  actual: number;
  target: number;
  /** expected value by now; omit for ranges without a pace marker */
  pace?: number | null;
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  const state: PaceState | "none" = pace === null || pace === undefined ? "none" : paceState(actual, pace);
  const fill = target > 0 ? Math.min(1, actual / target) : actual > 0 ? 1 : 0;
  const marker = target > 0 && pace !== null && pace !== undefined ? Math.min(1, Math.max(0, pace / target)) : null;
  const description = [
    label,
    `${formatNumber(actual)} of ${formatNumber(target)}`,
    state !== "none" ? STATE_LABEL[state] : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className={cn("min-w-0", className)} data-pace={state}>
      {!compact && (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-small">
          <span className="num text-ink">
            {label && <span className="mr-1.5 text-ink-muted">{label}</span>}
            {formatNumber(actual)} / {formatNumber(target)}
          </span>
          <span className="num text-ink-muted">{formatPercent(actual, target)}</span>
        </div>
      )}
      <div
        role="meter"
        aria-label={description}
        aria-valuemin={0}
        aria-valuemax={Math.max(target, 0)}
        aria-valuenow={actual}
        className="relative h-1.5 w-full rounded-full bg-surface-muted"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300 ease-out", FILL[state])}
          style={{ width: `${fill * 100}%` }}
        />
        {marker !== null && (
          <div
            aria-hidden
            className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-ink"
            style={{ left: `${marker * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}
