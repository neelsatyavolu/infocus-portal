"use client";

import { Field, fieldClass } from "@/components/kit/field";
import { cn } from "@/src/lib/utils";
import {
  clampExtensionDays,
  MAX_EXTENSION_DAYS,
  MIN_EXTENSION_DAYS,
  roundExtensionDays
} from "@/src/lib/package-extensions";

/** Days field that accepts one decimal place (1.5 = 36 hours); out-of-range values snap back on blur. */
function ExtensionDaysInput({
  value,
  onChange,
  className,
  id,
  "aria-describedby": describedBy
}: {
  value: number;
  onChange: (days: number) => void;
  className: string;
  id?: string;
  "aria-describedby"?: string;
}) {
  return (
    <input
      id={id}
      aria-describedby={describedBy}
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

const DAYS_HINT = "0.1–30 days, one decimal (1.5 = 36 hours)";

/** The Days field used by every dialog here: caps label, the input with a "days" suffix, the hint. */
export function DaysField({
  id,
  value,
  onChange,
  className
}: {
  id: string;
  value: number;
  onChange: (days: number) => void;
  /** Width of the input box (the field itself fills its grid cell). */
  className?: string;
}) {
  return (
    <Field label="Days" htmlFor={id} hint={DAYS_HINT}>
      <div className={cn("relative min-w-0", className)}>
        <ExtensionDaysInput
          id={id}
          aria-describedby={`${id}-hint`}
          value={value}
          onChange={onChange}
          className={cn(fieldClass, "pr-12 font-mono-broadcast tabular-nums")}
        />
        <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          days
        </span>
      </div>
    </Field>
  );
}
