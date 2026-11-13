import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "ec-btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold ring-offset-background transition-[color,background-color,box-shadow,transform] duration-300 ease-[cubic-bezier(.22,1,.36,1)] active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-300",
  {
    variants: {
      variant: {
        default: "ec-btn--fill bg-primary text-primary-foreground hover:text-background shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_8px_24px_-10px_hsl(var(--primary)/.7)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_14px_32px_-10px_hsl(var(--primary)/.8)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[inset_0_1px_0_rgba(255,255,255,.2)]",
        outline:
          "ec-btn--fill border border-border bg-transparent hover:border-transparent hover:text-background",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]",
        ghost: "hover:bg-foreground/[.06] hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 rounded-full px-4",
        lg: "h-12 rounded-full px-8 text-base",
        icon: "h-10 w-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
