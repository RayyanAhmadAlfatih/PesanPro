import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-semibold transition-[transform,box-shadow,background-color,color,border-color] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-[18px] shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:-translate-x-px hover:-translate-y-px hover:shadow-[2px_2px_0_var(--pp-ink)] active:translate-x-0 active:translate-y-0 active:shadow-none",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground hover:bg-primary",
        destructive: "border-destructive bg-background text-destructive hover:bg-destructive hover:text-destructive-foreground",
        outline: "border-foreground bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        secondary: "border-foreground bg-secondary text-secondary-foreground hover:bg-muted",
        ghost: "border-transparent bg-transparent text-foreground hover:border-foreground hover:bg-accent",
        link: "min-h-0 border-transparent bg-transparent p-0 text-foreground underline-offset-4 hover:translate-x-0 hover:translate-y-0 hover:shadow-none hover:underline",
        glass: "border-foreground bg-background text-foreground hover:bg-accent",
      },
      size: {
        default: "h-11 px-4 py-2 has-[>svg]:px-3",
        sm: "h-9 min-h-9 gap-1.5 px-3 has-[>svg]:px-2.5 max-[520px]:min-h-11",
        lg: "h-12 px-8 has-[>svg]:px-4",
        icon: "size-11 p-0",
        "icon-sm": "size-9 min-h-9 p-0 max-[520px]:size-11",
        "icon-lg": "size-12 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> { asChild?: boolean }

function Button({ className, variant = "default", size = "default", asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button"
  return <Comp data-slot="button" data-variant={variant} data-size={size} className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
