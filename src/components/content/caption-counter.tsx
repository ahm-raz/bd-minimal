import { cn } from "@/lib/utils";
import { CHAR_LIMITS, PLATFORM_LABELS, charCounterTone, type SocialPlatform } from "@/lib/social";
import { formatNumber } from "@/lib/format";

const TONE_CLASS = { ok: "text-ink-muted", warn: "text-warn-ink", bad: "text-bad" } as const;

/** "1,234 / 3,000": amber at 90% of the platform limit, red above it. A warning only; saving still works. */
export function CaptionCounter({ length, platform, id }: { length: number; platform: SocialPlatform | null; id?: string }) {
  const limit = platform ? CHAR_LIMITS[platform] : undefined;
  const tone = charCounterTone(length, limit);
  return (
    <span id={id} className={cn("num text-small", TONE_CLASS[tone])} data-tone={tone} aria-live="polite">
      {formatNumber(length)}
      {limit ? ` / ${formatNumber(limit)}` : " characters"}
      {tone === "bad" && platform && ` (over the ${PLATFORM_LABELS[platform]} limit)`}
    </span>
  );
}
