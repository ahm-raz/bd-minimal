import { cloneElement, isValidElement, type ReactElement } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/** Label above, helper or error below. Errors use --bad text (docs/06 section 5). */
export function FormField({
  label,
  htmlFor,
  error,
  helper,
  required,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  error?: string | null;
  helper?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const describedBy = htmlFor ? `${htmlFor}-msg` : undefined;
  // Point the control at its error or helper text, so screen readers read it with the field (WCAG 3.3.1).
  const message = error || helper ? describedBy : undefined;
  let control = children;
  if (isValidElement(children) && message) {
    const el = children as ReactElement<Record<string, unknown>>;
    control = cloneElement(el, {
      "aria-describedby": el.props["aria-describedby"] ?? message,
      "aria-invalid": el.props["aria-invalid"] ?? (error ? true : undefined),
    });
  }
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-small font-medium text-ink">
        {label}
        {required && (
          <span aria-hidden className="text-ink-muted">
            *
          </span>
        )}
      </Label>
      {control}
      {error ? (
        <p id={describedBy} className="animate-in text-small text-bad duration-150 fade-in-0 slide-in-from-top-0.5" role="alert">
          {error}
        </p>
      ) : helper ? (
        <p id={describedBy} className="text-small text-ink-muted">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
