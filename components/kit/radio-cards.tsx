import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

/**
 * A small choice drawn as equal-height option cards, on real radio inputs (keeps `required` and
 * form validation, arrow keys between options). The chosen card gets the brand edge and tint.
 * Also the large two-option picker inside dialogs (A-roll vs B-roll): pass `onChange` and act on it.
 */
export function RadioCards<T extends string>({
  name,
  value,
  onChange,
  options,
  legend,
  hideLegend = false,
  required = false,
  columns = 2,
  size = "default",
  className
}: {
  name: string;
  value: T | null;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; description?: ReactNode; disabled?: boolean }>;
  legend: ReactNode;
  hideLegend?: boolean;
  required?: boolean;
  columns?: 1 | 2 | 3 | 4;
  /** sm: one-line 40px cards (a segmented row inside a form). */
  size?: "default" | "sm";
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend
        className={cn(
          "mb-2 text-[13px] font-medium text-muted-foreground",
          hideLegend && "sr-only"
        )}
      >
        {legend}
      </legend>
      <div
        className={cn(
          "grid gap-2",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-3",
          columns === 4 && "grid-cols-2 sm:grid-cols-4"
        )}
      >
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                "relative flex h-full min-w-0 cursor-pointer flex-col justify-center gap-0.5 border px-3 transition-colors duration-150 ease-[var(--ease-ui)] has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30",
                size === "sm" ? "min-h-10 rounded-md py-2" : "min-h-16 rounded-lg py-3",
                checked ? "border-[var(--brand-green)] bg-brand-tint" : "border-input bg-card hover:bg-secondary",
                option.disabled && "cursor-not-allowed opacity-50 hover:bg-card"
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                required={required}
                disabled={option.disabled}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className={cn("text-sm text-foreground", "font-medium")}>{option.label}</span>
              {option.description ? <span className="text-[13px] leading-snug text-muted-foreground">{option.description}</span> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
