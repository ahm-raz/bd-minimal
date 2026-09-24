import { cn } from "@/lib/utils";
import { LEAD_STATUS_LABELS, type LeadStatus, type StageKey } from "@/lib/domain";

type Tone = "neutral" | "accent" | "ok" | "warn" | "bad" | "muted" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-muted text-ink-muted",
  accent: "bg-accent-soft text-accent-strong",
  ok: "bg-ok-soft text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  bad: "bg-bad-soft text-bad",
  muted: "bg-[var(--stage-lost-bg)] text-lost-ink",
  info: "bg-[#e6eef6] text-[#2f5a85]",
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
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-micro whitespace-nowrap",
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
  qualified: "bg-[var(--stage-qualified-bg)] text-[var(--stage-qualified-fg)]",
  meeting_done: "bg-[var(--stage-meeting-bg)] text-[var(--stage-meeting-fg)]",
  proposal_sent: "bg-[var(--stage-proposal-bg)] text-[var(--stage-proposal-fg)]",
  negotiation: "bg-[var(--stage-negotiation-bg)] text-[var(--stage-negotiation-fg)]",
  won: "bg-[var(--stage-won-bg)] text-[var(--stage-won-fg)]",
  lost: "bg-[var(--stage-lost-bg)] text-[var(--stage-lost-fg)]",
};

export function StageChip({ stage, label, className }: { stage: string; label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-micro whitespace-nowrap",
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
