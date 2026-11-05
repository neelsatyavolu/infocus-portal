"use client";

import { cn } from "@/src/lib/utils";

/** "n / 2000" in Geist Mono; amber near the limit, Danger at it. */
export function TextCounter({ length, max, id }: { length: number; max: number; id?: string }) {
  const ratio = length / max;
  return (
    <span
      id={id}
      className={cn(
        "font-mono-broadcast text-xs tabular-nums",
        ratio >= 1 ? "text-danger" : ratio >= 0.9 ? "text-[var(--brand-amber)]" : "text-muted-foreground"
      )}
    >
      {length} / {max}
    </span>
  );
}

/** A textarea held to the server's limit (feedback 2000, notes 5000). Saves are handled by the caller. */
export function LimitedTextarea({
  value,
  onChange,
  maxLength,
  placeholder,
  label,
  rows = 8,
  autoFocus = false,
  describedBy
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder: string;
  label: string;
  rows?: number;
  autoFocus?: boolean;
  describedBy?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={label}
      aria-describedby={describedBy}
      autoFocus={autoFocus}
      className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
    />
  );
}
