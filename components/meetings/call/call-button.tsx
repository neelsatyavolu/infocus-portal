"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/src/lib/utils";

/**
 * Call controls: square 8px plates (circles are only for avatars and status dots).
 * One family on every bar: 48px on desktop, 44px on phones (`compact`), 20px icons.
 *   on      = the surface's plate: the elevated surface and a strong hairline on the call bars
 *             (follows the theme), or a flat dark scrim with Soft White over video
 *             (`surface="video"`, the pre-join preview)
 *   off     = quiet Danger: the Danger tint with a Danger slashed icon (a device is off). Solid
 *             Danger stays for the final "are you sure?" confirm (DESIGN.md §10), never Record Red
 *   active  = the brand fill (InFocus Green, or the season's color: hand raised, presenting)
 * Focus: a 3px ring for keyboard focus only (focus-visible), never after a click.
 */
export type CallButtonState = "on" | "off" | "active";
export type CallSurface = "bar" | "video";
type TooltipSide = "top" | "left";

const FOCUS = "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45";

const PLATE: Record<CallSurface, string> = {
  bar: "border border-line-strong bg-secondary text-foreground hover:bg-[var(--ink-3)]",
  video: "bg-black/60 text-[var(--soft-white)] hover:bg-black/75"
};

/** Over video the tint keeps the fixed dark Danger hexes, so it reads on video in both themes. */
const OFF: Record<CallSurface, string> = {
  bar: "border border-line-strong bg-danger-tint text-danger hover:bg-danger-tint/70",
  video: "bg-[#3A1218]/85 text-[#FF7A8A] hover:bg-[#3A1218]"
};

function stateClass(state: CallButtonState, surface: CallSurface) {
  if (state === "off") return OFF[surface];
  if (state === "active") return "bg-[var(--brand-fill)] text-on-brand hover:bg-[var(--brand-fill-hover)]";
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
          "relative inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-150 ease-[var(--ease-ui)] disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-5 [&_svg]:shrink-0",
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
 * inline mono count; the open panel gets a 1px brand underline (tab language), so it never looks
 * like the filled "hand raised" state.
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
          "relative inline-flex h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-md border border-line-strong px-3 text-foreground transition-colors duration-150 ease-[var(--ease-ui)] [&_svg]:size-5 [&_svg]:shrink-0",
          open ? "bg-[var(--ink-3)]" : "bg-secondary hover:bg-[var(--ink-3)]",
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
        {open ? <span aria-hidden className="absolute inset-x-2 bottom-0 h-px bg-brand-green" /> : null}
        <Corner badge={badge} />
      </button>
    </WithTooltip>
  );
});

/** Leave: quiet destructive (Danger text on the elevated surface); a square on phones. */
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
          "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-line-strong bg-secondary text-sm font-medium text-danger transition-colors duration-150 ease-[var(--ease-ui)] hover:bg-danger-tint [&_svg]:size-5",
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
          "relative inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-150 ease-[var(--ease-ui)] hover:bg-[var(--ink-3)] [&_svg]:size-4",
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
