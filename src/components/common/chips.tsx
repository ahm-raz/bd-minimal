import { cn } from "@/lib/utils";
import { LEAD_STATUS_LABELS, type LeadStatus, type StageKey } from "@/lib/domain";

export type Tone = "neutral" | "accent" | "ok" | "warn" | "bad" | "muted" | "info" | "meeting";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-muted text-ink-muted",
  accent: "bg-accent-soft text-accent-strong",
  ok: "bg-ok-soft text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  bad: "bg-bad-soft text-bad",
  muted: "bg-stage-lost text-lost-ink",
  info: "bg-info-bg text-info-fg",
  meeting: "bg-stage-meeting text-stage-meeting-ink",
};

/** Chip: micro type, 20px tall, soft background, strong text (docs/06 section 5). */
export function Chip({
  tone = "neutral",
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-micro whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

const STAGE_STYLE: Record<StageKey, string> = {
  qualified: "bg-stage-qualified text-stage-qualified-ink",
  meeting_done: "bg-stage-meeting text-stage-meeting-ink",
  proposal_sent: "bg-stage-proposal text-stage-proposal-ink",
  negotiation: "bg-stage-negotiation text-stage-negotiation-ink",
  won: "bg-stage-won text-stage-won-ink",
  lost: "bg-stage-lost text-stage-lost-ink",
};

export function StageChip({ stage, label, className }: { stage: string; label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-micro whitespace-nowrap",
        STAGE_STYLE[stage as StageKey] ?? STAGE_STYLE.qualified,
        className,
      )}
    >
      {label}
    </span>
  );
}

const STATUS_TONE: Record<LeadStatus, Tone> = {
  new: "neutral",
  contacted: "neutral",
  replied: "accent",
  qualified: "info",
  customer: "ok",
  nurture: "warn",
  not_interested: "muted",
  lost: "muted",
  bad_fit: "muted",
};

export function StatusChip({ status, className }: { status: LeadStatus; className?: string }) {
  return (
    <Chip tone={STATUS_TONE[status]} className={cn(status === "bad_fit" && "line-through", className)}>
      {LEAD_STATUS_LABELS[status]}
    </Chip>
  );
}
