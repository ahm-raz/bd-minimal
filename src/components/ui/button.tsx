import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"
import { Loader2 } from "lucide-react"

// docs/06 section 5: primary (accent), secondary (surface + line), ghost, destructive (bad).
// Height 32px; 36px in forms (size="form"). Icon buttons grow to 40px on touch screens.
// A short press-down and colour ease give every click feedback; the global reduced-motion rule stills them.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent text-body font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out active:not-disabled:translate-y-px outline-none select-none aria-busy:cursor-progress focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-accent-strong text-on-accent shadow-card hover:bg-accent-hover",
        primary: "bg-accent-strong text-on-accent shadow-card hover:bg-accent-hover",
        secondary:
          "border-line-strong/70 bg-surface text-ink shadow-card hover:border-line-strong hover:bg-surface-muted aria-expanded:bg-surface-muted",
        outline:
          "border-line-strong/70 bg-surface text-ink shadow-card hover:border-line-strong hover:bg-surface-muted aria-expanded:bg-surface-muted",
        ghost: "text-ink hover:bg-surface-muted aria-expanded:bg-surface-muted",
        destructive: "bg-bad text-on-bad shadow-card hover:bg-bad-hover",
        link: "h-auto! px-0! text-accent-strong underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3",
        form: "h-9 px-3.5",
        sm: "h-7 px-2.5 text-small",
        xs: "h-6 gap-1 px-2 text-micro [&_svg:not([class*='size-'])]:size-3",
        lg: "h-9 px-4",
        icon: "size-8 pointer-coarse:size-10",
        "icon-xs": "size-6 pointer-coarse:size-9 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 pointer-coarse:size-10",
        "icon-lg": "size-9 pointer-coarse:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  pending = false,
  pendingText,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Working: shows a spinner (and `pendingText`, e.g. "Saving…"), disables the button and sets aria-busy. */
    pending?: boolean
    pendingText?: string
  }) {
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {children}
      </Slot.Root>
    )
  }

  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {pendingText ?? children}
        </>
      ) : (
        children
      )}
    </button>
  )
}

export { Button, buttonVariants }
