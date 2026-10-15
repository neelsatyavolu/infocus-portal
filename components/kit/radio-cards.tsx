import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

/**
 * A small choice drawn as equal-height option cards, on real radio inputs (keeps `required` and
 * form validation, arrow keys between options). The chosen card gets the green edge and tint.
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
          "mb-2 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground",
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
                "relative flex h-full min-w-0 cursor-pointer flex-col justify-center gap-0.5 rounded-md border px-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                size === "sm" ? "min-h-10 py-2" : "min-h-16 py-3",
                checked ? "border-[var(--brand-green)] bg-[rgb(43_179_110/0.08)]" : "border-input hover:bg-[var(--ink-3)]",
                option.disabled && "cursor-not-allowed opacity-50 hover:bg-transparent"
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
              <span className={cn("text-sm text-foreground", checked ? "font-semibold" : "font-medium")}>{option.label}</span>
              {option.description ? <span className="text-[13px] leading-snug text-muted-foreground">{option.description}</span> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
