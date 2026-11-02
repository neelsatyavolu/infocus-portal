import * as React from "react";

import { cn } from "../../lib/utils";

const Checkbox = React.forwardRef(({ className, checked, onCheckedChange, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    checked={Boolean(checked)}
    onChange={(event) => onCheckedChange?.(event.target.checked)}
    className={cn(
      "h-4 w-4 rounded-sm border border-line-strong bg-card accent-[var(--brand-fill)] disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";

export { Checkbox };
