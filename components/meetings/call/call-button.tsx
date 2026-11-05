"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/src/lib/utils";

/**
 * Call controls: square 6px plates (DESIGN.md §10: circles are only for avatars and status dots).
 * One family on every bar: 48px on desktop, 44px on phones (`compact`), 20px icons.
 *   on      = the surface's plate: Ink 3 on the call bars (follows the theme), or translucent
 *             dark with Soft White over video (`surface="video"`, the pre-join preview)
 *   off     = quiet Danger: the Danger tint with a Danger slashed icon (a device is off). Solid
 *             Danger stays for the final "are you sure?" confirm (DESIGN.md §10), never Record Red
 *   active  = InFocus Green (hand raised, presenting)
 * Focus: a 2px offset Green ring for keyboard focus only (focus-visible), never after a click.
 */
export type CallButtonState = "on" | "off" | "active";
export type CallSurface = "bar" | "video";
type TooltipSide = "top" | "left";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]";

const PLATE: Record<CallSurface, string> = {
  bar: "bg-[var(--ink-3)] text-foreground hover:bg-[var(--ink-4)]",
  video: "bg-[#0F110F]/70 text-[var(--soft-white)] hover:bg-[#0F110F]/85"
};

/** Over video the tint keeps the fixed dark Danger hexes, so it reads on video in both themes. */
const OFF: Record<CallSurface, string> = {
  bar: "bg-danger-tint text-danger hover:bg-danger-tint/70",
  video: "bg-[#3A1218]/85 text-[#FF7A8A] hover:bg-[#3A1218]"
};

function stateClass(state: CallButtonState, surface: CallSurface) {
  if (state === "off") return OFF[surface];
  if (state === "active") return "bg-primary text-primary-foreground hover:bg-[var(--brand-fill-hover)]";
  return PLATE[surface];
}

const SQUARE = { regular: "h-12 w-12", compact: "h-11 w-11" } as const;

type BaseProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  /** Shown in the tooltip after the label, e.g. "⌘D" (see shortcutLabel). */
  shortcut?: string;
  /** Corner mark: a CountBadge. */
  badge?: ReactNode;
  /**
   * What the badge says, in words ("3 unread"). The button's aria-label replaces its contents, so
   * the badge's own screen-reader text is never read; this is added to the name instead (the
   * tooltip keeps the short label).
   */
  srDetail?: string;
  tooltipSide?: TooltipSide;
};

function accessibleName(label: string, srDetail: string | undefined) {
  return srDetail ? `${label}, ${srDetail}` : label;
}

function Corner({ badge }: { badge: ReactNode }) {
  if (badge === undefined || badge === null || badge === false) return null;
  return <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex">{badge}</span>;
}

export function WithTooltip({
  label,
  shortcut,
  side = "top",
  children
}: {
  label: string;
  shortcut?: string;
  side?: TooltipSide;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="flex items-center gap-2">
        {label}
        {shortcut ? <kbd className="font-mono text-[11px] text-muted-foreground">{shortcut}</kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}

export const CallButton = forwardRef<
  HTMLButtonElement,
  BaseProps & { state?: CallButtonState; surface?: CallSurface; compact?: boolean }
>(function CallButton(
  { label, shortcut, badge, srDetail, tooltipSide, state = "on", surface = "bar", compact = false, className, children, ...props },
  ref
) {
  return (
    <WithTooltip label={label} shortcut={shortcut} side={tooltipSide}>
      <button
        ref={ref}
        type="button"
        aria-label={accessibleName(label, srDetail)}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center rounded-[6px] transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0",
          SQUARE[compact ? "compact" : "regular"],
          FOCUS,
          stateClass(state, surface),
          className
        )}
        {...props}
      >
        {children}
        <Corner badge={badge} />
      </button>
    </WithTooltip>
  );
});

/**
 * Opens a side panel (People, Chat, Agenda). Same plate and height as the call buttons, with an
 * inline mono count; the open panel gets a 2px green underline (tab language), so it never looks
 * like the green "hand raised" state.
 */
export const PanelToggle = forwardRef<HTMLButtonElement, BaseProps & { open: boolean; count?: ReactNode }>(function PanelToggle(
  { label, shortcut, badge, srDetail, tooltipSide, open, count, className, children, ...props },
  ref
) {
  return (
    <WithTooltip label={label} shortcut={shortcut} side={tooltipSide}>
      <button
        ref={ref}
        type="button"
        aria-label={accessibleName(label, srDetail)}
        aria-pressed={open}
        className={cn(
          "relative inline-flex h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-[6px] px-3 text-foreground transition-colors [&_svg]:size-5 [&_svg]:shrink-0",
          open ? "bg-[var(--ink-4)]" : "bg-[var(--ink-3)] hover:bg-[var(--ink-4)]",
          FOCUS,
          className
        )}
        {...props}
      >
        {children}
        {count !== undefined && count !== null ? (
          <span aria-hidden className="font-mono text-[13px] tabular-nums text-[var(--ink-text)]">
            {count}
          </span>
        ) : null}
        {open ? <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 bg-[var(--brand-green)]" /> : null}
        <Corner badge={badge} />
      </button>
    </WithTooltip>
  );
});

/** Leave: quiet destructive (Danger text and border, no fill); a square on phones. */
export const LeaveButton = forwardRef<HTMLButtonElement, BaseProps & { compact?: boolean }>(function LeaveButton(
  { label, shortcut, tooltipSide, compact, className, children, ...props },
  ref
) {
  return (
    <WithTooltip label={label} shortcut={shortcut} side={tooltipSide}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-2 rounded-[6px] border border-[var(--danger-text)]/60 bg-transparent text-sm font-medium text-danger transition-colors hover:bg-danger-tint [&_svg]:size-5",
          compact ? SQUARE.compact : "h-12 px-5",
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

const ICON_SIZE = { sm: "h-8 w-8", md: "h-9 w-9", touch: "h-11 w-11" } as const;

/** A plain ghost icon button for panel headers and rows (36px; 44px on phones with size="touch"). */
export const IconButton = forwardRef<
  HTMLButtonElement,
  BaseProps & { size?: keyof typeof ICON_SIZE; tone?: "default" | "danger" }
>(function IconButton({ label, shortcut, badge, srDetail, tooltipSide, size = "md", tone = "default", className, children, ...props }, ref) {
  return (
    <WithTooltip label={label} shortcut={shortcut} side={tooltipSide}>
      <button
        ref={ref}
        type="button"
        aria-label={accessibleName(label, srDetail)}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--ink-3)] [&_svg]:size-4",
          tone === "danger" ? "text-danger" : "text-muted-foreground hover:text-foreground",
          ICON_SIZE[size],
          FOCUS,
          className
        )}
        {...props}
      >
        {children}
        <Corner badge={badge} />
      </button>
    </WithTooltip>
  );
});
