import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

export type ControlSize = "sm" | "md" | "touch";

/** One control's own height for each size (buttons, inputs, IconButton, SearchField, chips). */
export const CONTROL_HEIGHT: Record<ControlSize, string> = {
  sm: "h-8",
  md: "h-9",
  touch: "h-10 md:h-9"
};

/**
 * Height every direct child of a control row is held to. sm = 32px (h-8), md = 36px (h-9, the
 * default for buttons, inputs and selects), touch = 40px on phones and 36px from md.
 */
export const CONTROL_ROW_HEIGHT: Record<ControlSize, string> = {
  sm: "*:h-8",
  md: "*:h-9",
  touch: "*:h-10 md:*:h-9"
};

/**
 * A row of matched controls (rule 2): every direct child gets the same height, the gap is 8px,
 * and rows wrap cleanly. Put buttons, IconButtons, selects, SearchField and SegmentedControl in
 * it; keep at most one primary (filled) button, last. Status never goes here — use StatusTag
 * beside the title instead.
 */
export function ActionBar({
  size = "md",
  align = "start",
  fullWidthOnPhone = false,
  className,
  children,
  "aria-label": ariaLabel
}: {
  size?: ControlSize;
  align?: "start" | "end" | "between";
  /** Children share the full width below sm (two buttons → two equal halves; square icon buttons stay square). */
  fullWidthOnPhone?: boolean;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <div
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-2",
        CONTROL_ROW_HEIGHT[size],
        align === "end" && "justify-end",
        align === "between" && "justify-between",
        fullWidthOnPhone && "max-sm:w-full max-sm:[&>*:not(.aspect-square)]:flex-1",
        className
      )}
    >
      {children}
    </div>
  );
}

/** A short vertical hairline between groups of controls in an ActionBar or Toolbar. */
export function ActionBarDivider({ className }: { className?: string }) {
  return <span aria-hidden className={cn("h-5! w-px shrink-0 self-center bg-border", className)} />;
}

/**
 * The one row under a page header for page-scope controls: filters and search at the start,
 * secondary actions at the end, an optional muted count. All controls share one height and the
 * row wraps on phones. `busy` draws a 2px progress line under the row (silent refreshes).
 * With `aria-label` it is a labelled group. (Not role="toolbar": that promises arrow-key
 * movement between controls, and these are ordinary Tab stops that can include a text field.)
 */
export function Toolbar({
  start,
  end,
  meta,
  size = "md",
  busy = false,
  className,
  "aria-label": ariaLabel
}: {
  start?: ReactNode;
  end?: ReactNode;
  /** Muted text after the start controls ("12 groups"). Use Geist Mono for the number. */
  meta?: ReactNode;
  size?: ControlSize;
  busy?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      className={cn("relative flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2", className)}
    >
      {start ? (
        <ActionBar size={size} className="min-w-0 max-w-full">
          {start}
        </ActionBar>
      ) : null}
      {meta ? <div className="min-w-0 text-sm text-muted-foreground">{meta}</div> : null}
      {end ? (
        <ActionBar size={size} align="end" className="ml-auto">
          {end}
        </ActionBar>
      ) : null}
      {busy ? (
        <span aria-hidden className="absolute inset-x-0 -bottom-1 h-0.5 overflow-hidden rounded-full bg-[var(--ink-3)]">
          <span className="block h-full w-1/3 bg-[var(--brand-fill)] motion-safe:animate-[loading-bar_1s_ease-in-out_infinite]" />
        </span>
      ) : null}
    </div>
  );
}
