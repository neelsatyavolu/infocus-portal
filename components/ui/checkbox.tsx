"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/src/lib/utils";

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "onChange" | "size"> & {
  /** true, false, or "indeterminate" (select-all with some rows chosen). */
  checked?: boolean | "indeterminate";
  onCheckedChange?: (checked: boolean) => void;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  /** Wraps the box in a <label> with this text (40px tall touch target). */
  children?: React.ReactNode;
  /** md: a lone box gets a 40px clickable area (rows, cards). Give it an aria-label. */
  size?: "sm" | "md";
  labelClassName?: string;
};

/**
 * Brand checkbox on a real <input type="checkbox"> (keeps `required` and form validation):
 * 16px, 4px radius, 3:1 control border, InFocus Green when checked, a focus ring, and a
 * tri-state "indeterminate" look.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ checked, onCheckedChange, onChange, children, size = "sm", className, labelClassName, disabled, ...props }, forwardedRef) => {
    const inner = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(forwardedRef, () => inner.current as HTMLInputElement);
    const indeterminate = checked === "indeterminate";

    React.useEffect(() => {
      if (inner.current) inner.current.indeterminate = indeterminate;
    }, [indeterminate]);

    // A lone md box is its own <label>, so the whole 40px area toggles it. With text, the outer
    // <label> does that (labels can't nest).
    const Box = size === "md" && !children ? "label" : "span";
    const box = (
      <Box
        className={cn(
          "relative inline-grid shrink-0 place-items-center",
          size === "md" && "h-10 w-10",
          Box === "label" && (disabled ? "cursor-not-allowed" : "cursor-pointer"),
          className
        )}
      >
        <input
          ref={inner}
          type="checkbox"
          // Undefined keeps it uncontrolled (defaultChecked); "indeterminate" reads as mixed through
          // the DOM property set above (no aria-checked on a native checkbox).
          checked={checked === undefined ? undefined : checked === true}
          disabled={disabled}
          onChange={(event) => {
            onChange?.(event);
            onCheckedChange?.(event.target.checked);
          }}
          className="peer h-4 w-4 cursor-pointer appearance-none rounded-sm border border-input bg-transparent transition-colors checked:border-[var(--brand-fill)] checked:bg-[var(--brand-fill)] indeterminate:border-[var(--brand-fill)] indeterminate:bg-[var(--brand-fill)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          {...props}
        />
        <Check aria-hidden className="pointer-events-none absolute hidden h-3 w-3 text-[var(--on-brand)] peer-checked:block" strokeWidth={3} />
        <Minus aria-hidden className="pointer-events-none absolute hidden h-3 w-3 text-[var(--on-brand)] peer-indeterminate:block" strokeWidth={3} />
      </Box>
    );

    if (!children) return box;
    return (
      <label
        className={cn(
          "inline-flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-foreground",
          disabled && "cursor-not-allowed opacity-60",
          labelClassName
        )}
      >
        {box}
        <span className="min-w-0">{children}</span>
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
