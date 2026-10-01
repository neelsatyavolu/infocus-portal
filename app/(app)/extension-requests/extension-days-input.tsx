"use client";

import {
  clampExtensionDays,
  MAX_EXTENSION_DAYS,
  MIN_EXTENSION_DAYS,
  roundExtensionDays
} from "@/src/lib/package-extensions";

/** Days field that accepts one decimal place (1.5 = 36 hours); out-of-range values snap back on blur. */
export function ExtensionDaysInput({
  value,
  onChange,
  className
}: {
  value: number;
  onChange: (days: number) => void;
  className: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={MIN_EXTENSION_DAYS}
      max={MAX_EXTENSION_DAYS}
      step={0.1}
      value={value}
      onChange={(event) =>
        onChange(Math.min(MAX_EXTENSION_DAYS, roundExtensionDays(Number(event.target.value) || 0)))
      }
      onBlur={() => onChange(clampExtensionDays(value))}
      className={className}
    />
  );
}
