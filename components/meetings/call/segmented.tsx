"use client";

import { Check } from "lucide-react";
import { cn } from "@/src/lib/utils";

/**
 * Segmented radio group. Selected = InFocus Green fill + check (aria-checked); keyboard focus
 * is a separate offset ring (focus-visible only), so focus never looks like a selection.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex min-h-11 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium transition-colors md:min-h-9",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink-2)]",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground outline outline-1 outline-[var(--ink-4)] hover:bg-[var(--ink-3)] hover:text-foreground"
            )}
          >
            {selected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
