import { cn } from "@/lib/utils";

/** Page title on the left; range picker and primary action on the right (docs/06 section 4). */
export function PageHeader({
  title,
  meta,
  actions,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="truncate text-title text-ink">{title}</h1>
        {meta && <div className="text-small text-ink-muted">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Panel: 1px line border, hairline card shadow, 12px radius (docs/06 section 5). */
export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("rounded-lg border border-line bg-surface shadow-card", className)} {...props} />;
}

export function PanelHeader({
  title,
  meta,
  actions,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3", className)}>
      <div className="flex items-baseline gap-3">
        <h2 className="text-section text-ink">{title}</h2>
        {meta && <span className="text-small text-ink-muted">{meta}</span>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Stat blocks sit in a grid divided by 1px lines, not separate cards. */
export function StatGrid({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-card sm:grid-cols-4",
        className,
      )}
      {...props}
    />
  );
}

export function StatBlock({
  label,
  value,
  sub,
  children,
  onClick,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  children?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <div className="text-small text-ink-muted">{label}</div>
      <div className="num mt-1 text-display-num text-ink">{value}</div>
      {sub && <div className="num mt-0.5 text-small text-ink-muted">{sub}</div>}
      {children && <div className="mt-2">{children}</div>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "group/stat bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:-outline-offset-2",
          className,
        )}
      >
        {body}
      </button>
    );
  }
  return <div className={cn("bg-surface px-4 py-3", className)}>{body}</div>;
}
