import { cn } from "@/lib/utils";
import { Chip } from "@/components/common/chips";
import { PLATFORM_LABELS, PLATFORM_SHORT, POST_STATUS_LABELS, POST_STATUS_TONE, type PostStatus, type SocialPlatform } from "@/lib/social";

/** Post status chip (docs/09 section 4): cancelled is muted and struck through. */
export function PostStatusChip({ status, className }: { status: PostStatus; className?: string }) {
  return (
    <Chip tone={POST_STATUS_TONE[status]} className={cn(status === "cancelled" && "line-through", className)} data-status={status}>
      {POST_STATUS_LABELS[status]}
    </Chip>
  );
}

/** Short platform mark ("LI", "IG") with the full name for screen readers and on hover. */
export function PlatformChip({ platform, className }: { platform: SocialPlatform; className?: string }) {
  return (
    <Chip tone="info" className={cn("font-medium", className)} title={PLATFORM_LABELS[platform]}>
      <span aria-hidden>{PLATFORM_SHORT[platform]}</span>
      <span className="sr-only">{PLATFORM_LABELS[platform]}</span>
    </Chip>
  );
}
