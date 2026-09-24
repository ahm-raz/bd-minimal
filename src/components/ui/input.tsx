import * as React from "react"
import { cn } from "cn"

// docs/06: 36px, label above, helper or error below. Errors use --bad text and border.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-line bg-surface px-3 py-1 text-body text-ink transition-colors outline-none placeholder:text-ink-faint focus-visible:border-accent-strong focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent-strong disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-faint aria-invalid:border-bad",
        className
      )}
      {...props}
    />
  )
}

export { Input }
