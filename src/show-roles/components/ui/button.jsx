import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";

// Same look as the Portal Button (components/ui/button.tsx): white primary, quiet outline/ghost.
const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium leading-none tracking-[-0.005em] transition-[background-color,border-color,color] duration-150 ease-[var(--ease-ui)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-cta text-cta-foreground hover:bg-cta-hover",
        secondary: "border border-line-strong bg-secondary text-secondary-foreground hover:bg-[var(--ink-3)]",
        warning: "border border-line-strong bg-secondary text-[var(--brand-amber)] hover:bg-[var(--ink-3)]",
        success: "bg-[var(--brand-fill)] text-on-brand hover:bg-[var(--brand-fill-hover)]",
        destructive: "border border-line-strong bg-secondary text-danger hover:bg-danger-tint",
        outline: "border border-line-strong bg-secondary text-foreground hover:bg-[var(--ink-3)]",
        ghost: "text-foreground/80 hover:bg-[var(--ink-3)] hover:text-foreground",
        link: "h-auto px-0 text-brand-green underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 rounded-md px-3 text-[13px]",
        lg: "h-10 rounded-md px-5",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => {
  return <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
