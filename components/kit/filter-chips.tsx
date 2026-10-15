"use client";

import type { ReactNode } from "react";
import { CONTROL_HEIGHT, type ControlSize } from "@/components/kit/action-bar";
import { formatCount, toneTextClass, type StatusToneInput } from "@/components/kit/tone";
import { cn } from "@/src/lib/utils";

export type FilterChipOption<T extends string> = {
  value: T;
  label: ReactNode;
  count?: number;
  /** Colors the count while the chip is not selected (e.g. "warning" for Needs you). */
  tone?: StatusToneInput;
  hidden?: boolean;
  /** Hide the chip while its count is 0 (never hides the selected chip). */
  hideWhenZero?: boolean;
  title?: string;
};

/**
 * Single-select filter chips with mono counts (Needs you 3 · Pending 5 · All 12). The selected
 * chip uses the InFocus Green fill. One row that scrolls sideways on phones and wraps from sm.
 * Chips match the other controls of their row: `md` (36px, default) beside h-9 buttons in a
 * Toolbar, `sm` (32px) in a panel header, `touch` 40px on phones and 36px from md.
 * The row sizes itself (`h-auto!`), so a parent ActionBar/Toolbar never clips it when it wraps.
 * To remember the choice, keep `value` in useRememberedState.
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  className
}: {
  options: Array<FilterChipOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: ControlSize;
  className?: string;
}) {
  const shown = options.filter(
    (option) => option.value === value || !(option.hidden || (option.hideWhenZero && option.count === 0))
  );
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "flex h-auto! min-w-0 max-w-full gap-2 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {shown.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              CONTROL_HEIGHT[size],
              active
                ? "border-transparent bg-[var(--brand-fill)] font-medium text-[var(--on-brand)]"
                : "border-input text-[var(--ink-text)] hover:bg-[var(--ink-3)] hover:text-foreground"
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span
                className={cn(
                  "font-mono-broadcast text-[11px] tabular-nums",
                  active ? "opacity-80" : option.tone ? toneTextClass(option.tone) : "text-muted-foreground"
                )}
              >
                {formatCount(option.count)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
