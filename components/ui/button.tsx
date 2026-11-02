import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/src/lib/utils";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium leading-none tracking-[-0.005em] transition-[background-color,border-color,color,box-shadow] duration-150 ease-[var(--ease-ui)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary: white with black text in Dark, black with white in Light. One per view (DESIGN.md §10).
        default: "bg-cta text-cta-foreground hover:bg-cta-hover",
        // Accent: InFocus Green (or the season's fill). For the view's single most important action,
        // used instead of the primary, never beside it.
        accent: "bg-[var(--brand-fill)] text-on-brand hover:bg-[var(--brand-fill-hover)]",
        // Solid Danger fill: only for the final "are you sure?" confirm (DESIGN.md §10).
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // Quiet destructive: Danger text on the secondary surface. Use for Delete/Remove everywhere else.
        "destructive-quiet": "border border-line-strong bg-secondary text-danger hover:bg-danger-tint",
        // Secondary: elevated surface plus a strong hairline. Sits beside a primary.
        outline: "border border-line-strong bg-secondary text-foreground hover:bg-[var(--ink-3)]",
        secondary: "border border-line-strong bg-secondary text-secondary-foreground hover:bg-[var(--ink-3)]",
        ghost: "text-foreground/80 hover:bg-[var(--ink-3)] hover:text-foreground",
        link: "h-auto px-0 text-brand-green underline-offset-4 hover:underline"
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 rounded-md px-3 text-[13px]",
        lg: "h-10 rounded-md px-5",
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
