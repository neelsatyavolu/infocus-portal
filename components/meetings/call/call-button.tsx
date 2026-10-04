"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/src/lib/utils";

/** Square 6px-radius control (DESIGN.md: no pills). `off` = muted/disabled device state. */
export const CallButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    active?: boolean;
    off?: boolean;
    badge?: ReactNode;
    tone?: "default" | "danger";
  }
>(function CallButton({ label, active, off, badge, tone = "default", className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)] disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:size-5 [&_svg]:shrink-0",
        tone === "danger"
          ? "border-input bg-transparent text-danger hover:bg-danger-tint"
          : off
            ? "border-transparent bg-danger-tint text-danger hover:bg-danger-tint/80"
            : active
              ? "border-transparent bg-primary text-primary-foreground hover:bg-[var(--brand-fill-hover)]"
              : "border-[var(--ink-4)] bg-[var(--ink-2)] text-foreground hover:bg-[var(--ink-3)]",
        className
      )}
      {...props}
    >
      {children}
      {badge !== undefined && badge !== null && badge !== 0 ? (
        <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-sm bg-primary px-1 font-mono text-[10px] leading-5 tabular-nums text-primary-foreground">
          {badge}
        </span>
      ) : null}
    </button>
  );
});
