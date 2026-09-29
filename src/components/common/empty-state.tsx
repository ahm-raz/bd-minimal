import { cn } from "@/lib/utils";

/** One sentence saying what goes here, plus one primary action (docs/06 section 5). */
export function EmptyState({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex animate-enter flex-col items-start gap-3 px-4 py-8", className)}>
      <p className="prose-width text-body text-ink-muted">{children}</p>
      {action}
    </div>
  );
}

/** Error state: says what happened and what to do. */
export function ErrorState({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("flex animate-enter flex-col items-start gap-3 px-4 py-6", className)}>
      <p className="prose-width text-body text-bad">{children}</p>
      {action}
    </div>
  );
}
