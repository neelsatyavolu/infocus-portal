import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "fluid-btn press-feedback inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border border-cyan-300/35 bg-gradient-to-br from-cyan-300 via-sky-300 to-blue-500 text-slate-950 light:text-white shadow-[0_10px_24px_rgba(56,189,248,0.28)] hover:from-cyan-200 hover:via-sky-200 hover:to-blue-400",
        secondary:
          "border border-emerald-300/35 bg-gradient-to-br from-emerald-300 via-green-300 to-emerald-500 text-[#04150f] shadow-[0_10px_24px_rgba(16,185,129,0.26)] hover:from-emerald-200 hover:via-green-200 hover:to-emerald-400",
        warning:
          "border border-amber-300/40 bg-gradient-to-br from-amber-300 via-orange-300 to-amber-500 text-[#2b1202] light:text-white shadow-[0_10px_24px_rgba(245,158,11,0.24)] hover:from-amber-200 hover:via-orange-200 hover:to-amber-400",
        success:
          "border border-lime-300/40 bg-gradient-to-br from-lime-300 via-emerald-300 to-green-500 text-[#06150a] light:text-white shadow-[0_10px_24px_rgba(34,197,94,0.24)] hover:from-lime-200 hover:via-emerald-200 hover:to-green-400",
        destructive:
          "border border-rose-300/35 bg-gradient-to-br from-rose-300 via-red-300 to-rose-500 text-[#2a0a0f] light:text-white shadow-[0_10px_24px_rgba(239,68,68,0.24)] hover:from-rose-200 hover:via-red-200 hover:to-rose-400",
        outline:
          "border border-slate-400/35 bg-slate-900/70 light:bg-muted text-slate-100 light:text-foreground shadow-[0_8px_20px_rgba(15,23,42,0.22)] hover:border-cyan-300/50 hover:bg-slate-800/80 light:hover:bg-foreground/5",
        ghost: "text-slate-200 light:text-foreground hover:bg-slate-800/70 light:hover:bg-foreground/5",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
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
