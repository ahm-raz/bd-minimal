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
      {children}
      {error ? (
        <p id={describedBy} className="text-small text-bad" role="alert">
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
