"use client";

import type { KeyboardEvent, PointerEvent } from "react";
import { MAX_PANEL_WIDTH_PX, MIN_PANEL_WIDTH_PX } from "@/components/review/use-review-split-layout";
import { cn } from "@/src/lib/utils";

/**
 * The divider between the player and the comments panel (desktop split): drag it, or focus it and
 * use ←/→, to resize the panel; double-click resets the width.
 */
export function ReviewSplitter({
  controlsId,
  panelWidthPx,
  isResizing,
  onPointerDown,
  onDoubleClick,
  onKeyDown
}: {
  controlsId: string;
  panelWidthPx: number;
  isResizing: boolean;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  return (
    <div className="relative hidden lg:flex lg:items-stretch lg:justify-center">
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize comments panel"
        aria-controls={controlsId}
        aria-valuenow={panelWidthPx}
        aria-valuemin={MIN_PANEL_WIDTH_PX}
        aria-valuemax={MAX_PANEL_WIDTH_PX}
        title="Drag to resize comments panel (double-click to reset)"
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        className={cn(
          "group/splitter relative h-full w-full cursor-col-resize touch-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isResizing && "bg-[var(--brand-green)]/5"
        )}
      >
        <span
          className={cn(
            "pointer-events-none absolute bottom-2 left-1/2 top-2 w-px -translate-x-1/2 bg-border transition-colors",
            isResizing ? "bg-[var(--brand-green)]" : "group-hover/splitter:bg-muted-foreground"
          )}
        />
        <span
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 h-12 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm transition-colors",
            isResizing ? "bg-[var(--brand-green)]/70" : "bg-[var(--ink-4)] group-hover/splitter:bg-muted-foreground"
          )}
        />
      </div>
    </div>
  );
}
