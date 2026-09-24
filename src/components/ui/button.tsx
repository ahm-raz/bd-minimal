import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// docs/06 section 5: primary (accent), secondary (surface + line), ghost, destructive (bad).
// Height 32px; 36px in forms (size="form").
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent text-body font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-accent-strong text-white hover:bg-accent-hover",
        primary: "bg-accent-strong text-white hover:bg-accent-hover",
        secondary: "border-line bg-surface text-ink hover:bg-surface-muted aria-expanded:bg-surface-muted",
        outline: "border-line bg-surface text-ink hover:bg-surface-muted aria-expanded:bg-surface-muted",
        ghost: "text-ink hover:bg-surface-muted aria-expanded:bg-surface-muted",
        destructive: "bg-bad text-white hover:bg-[#9a2922]",
        link: "h-auto! px-0! text-accent-strong underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3",
        form: "h-9 px-3.5",
        sm: "h-7 px-2.5 text-small",
        xs: "h-6 gap-1 px-2 text-micro [&_svg:not([class*='size-'])]:size-3",
        lg: "h-9 px-4",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
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
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
