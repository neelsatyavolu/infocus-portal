"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/src/lib/utils";

/**
 * Call controls: 48px square plates (DESIGN.md §10: circles are only for avatars and status dots).
 * on      = translucent dark Ink with a Soft White icon (reads on video and on both themes)
 * off     = solid Danger with a Soft White icon (a device is off; never Record Red)
 * active  = InFocus Green (hand raised, presenting, panel open)
 * Focus: a 2px offset Green ring for keyboard focus only (focus-visible), never after a click.
 */
export type CallButtonState = "on" | "off" | "active";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]";

const STATE_CLASS: Record<CallButtonState, string> = {
  on: "bg-[#0F110F]/70 text-[var(--soft-white)] hover:bg-[#0F110F]/85",
  off: "bg-[var(--danger)] text-[var(--soft-white)] hover:bg-[var(--danger)]/90",
  active: "bg-primary text-primary-foreground hover:bg-[var(--brand-fill-hover)]"
};

type BaseProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  /** Shown in the tooltip after the label, e.g. "⌘D". */
  shortcut?: string;
  badge?: ReactNode;
};

function Badge({ value }: { value: ReactNode }) {
  if (value === undefined || value === null || value === 0) return null;
  return (
    <span className="absolute -right-1 -top-1 min-w-5 rounded-[4px] bg-primary px-1 text-center font-mono text-[10px] leading-5 tabular-nums text-primary-foreground">
      {value}
    </span>
  );
}

function WithTooltip({ label, shortcut, children }: { label: string; shortcut?: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="flex items-center gap-2">
        {label}
        {shortcut ? <kbd className="font-mono text-[11px] text-muted-foreground">{shortcut}</kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}

export const CallButton = forwardRef<HTMLButtonElement, BaseProps & { state?: CallButtonState }>(function CallButton(
  { label, shortcut, badge, state = "on", className, children, ...props },
  ref
) {
  return (
    <WithTooltip label={label} shortcut={shortcut}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(
          "relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[6px] transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0",
          FOCUS,
          STATE_CLASS[state],
          className
        )}
        {...props}
      >
        {children}
        <Badge value={badge} />
      </button>
    </WithTooltip>
  );
});

/** Leave: a wider button in the quiet destructive style (Danger text and border, no fill). */
export const LeaveButton = forwardRef<HTMLButtonElement, BaseProps & { compact?: boolean }>(function LeaveButton(
  { label, shortcut, compact, className, children, ...props },
  ref
) {
  return (
    <WithTooltip label={label} shortcut={shortcut}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(
          "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-[6px] border border-[var(--danger-text)]/60 bg-transparent text-sm font-medium text-danger transition-colors hover:bg-danger-tint [&_svg]:size-5",
          compact ? "w-12" : "px-5",
          FOCUS,
          className
        )}
        {...props}
      >
        {children}
      </button>
    </WithTooltip>
  );
});

/** A plain 44px icon button for panel headers and rows (no fill until hover). */
export const IconButton = forwardRef<HTMLButtonElement, BaseProps>(function IconButton(
  { label, shortcut, badge, className, children, ...props },
  ref
) {
  return (
    <WithTooltip label={label} shortcut={shortcut}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(
          "relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--ink-3)] hover:text-foreground [&_svg]:size-5",
          FOCUS,
          className
        )}
        {...props}
      >
        {children}
        <Badge value={badge} />
      </button>
    </WithTooltip>
  );
});
