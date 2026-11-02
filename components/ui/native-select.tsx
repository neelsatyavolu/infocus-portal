import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/src/lib/utils";

/**
 * A native <select> styled exactly like Input (h-9, 8px radius, card surface, 16px text on
 * phones). Use it where the phone's own picker or native `required` validation matters; use
 * ui/select.tsx elsewhere. `size="sm"` is h-8 for table cells.
 */
const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
    size?: "sm" | "default";
    /** A first, empty option ("Choose…"). */
    placeholderOption?: string;
    wrapperClassName?: string;
  }
>(({ className, wrapperClassName, size = "default", placeholderOption, children, ...props }, ref) => (
  <div className={cn("relative min-w-0", wrapperClassName)}>
    <select
      ref={ref}
      className={cn(
        "w-full min-w-0 appearance-none truncate rounded-md border border-input bg-card pl-3 pr-8 text-base text-foreground transition-[border-color,box-shadow] duration-150 ease-[var(--ease-ui)] hover:border-[var(--ink-5)] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm [&>option]:bg-popover [&>option]:text-popover-foreground",
        size === "sm" ? "h-8" : "h-9",
        className
      )}
      {...props}
    >
      {placeholderOption !== undefined ? <option value="">{placeholderOption}</option> : null}
      {children}
    </select>
    <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
  </div>
));
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
