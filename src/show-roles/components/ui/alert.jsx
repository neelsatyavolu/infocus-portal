import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "../../lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 shadow-[0_10px_24px_rgba(15,23,42,0.2)] [&>svg~*]:pl-7 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg+div]:translate-y-[-3px] [&>p]:leading-relaxed",
  {
    variants: {
      variant: {
        default: "border-emerald-300/35 bg-emerald-400/10 text-emerald-100",
        destructive: "border-rose-300/45 bg-rose-400/10 text-rose-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Alert = React.forwardRef(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h5 ref={ref} className={cn("mb-1 font-medium leading-none tracking-tight", className)} {...props} />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
