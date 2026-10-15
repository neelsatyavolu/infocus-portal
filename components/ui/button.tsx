import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/src/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[var(--brand-fill-hover)]",
        // Solid Danger fill: only for the final "are you sure?" confirm (DESIGN.md §10).
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // Quiet destructive: Danger text, no fill. Use for Delete/Remove everywhere else.
        "destructive-quiet": "border border-input bg-transparent text-danger hover:bg-danger-tint",
        // DESIGN.md §10: 1px line, transparent fill, Ink 3 on hover (so it reads the same on the
        // page and on a card, and matches the kit's outline controls in the same row).
        outline: "border border-input bg-transparent hover:bg-[var(--ink-3)] hover:text-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-[var(--ink-3)] hover:text-foreground",
        link: "text-brand-green underline-offset-4 hover:underline"
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
        // Square 32px, for icon buttons beside size="sm" buttons.
        "icon-sm": "h-8 w-8"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
