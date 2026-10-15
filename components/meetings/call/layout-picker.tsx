"use client";

import { useState, type KeyboardEvent } from "react";
import { rovingIndex } from "@/components/kit/roving";
import type { LayoutMode } from "@/src/lib/meetings/client/layout";
import { cn } from "@/src/lib/utils";

export const LAYOUT_OPTIONS: ReadonlyArray<{ mode: LayoutMode; label: string; description: string }> = [
  { mode: "auto", label: "Auto", description: "Grid, or a big view when someone pins or shares" },
  { mode: "tiled", label: "Tiled", description: "Everyone the same size" },
  { mode: "spotlight", label: "Spotlight", description: "One person or screen fills the stage" },
  { mode: "sidebar", label: "Sidebar", description: "Big view plus a strip of everyone else" }
];

export const LAYOUT_ALONE_HINT = "Layouts change once others join.";

/**
 * Segmented radio group in the kit's look (one bordered box, the selected segment in InFocus Green,
 * like the call's other segmented controls). ←/→ move the choice. Keyboard focus gets an inset ring, so focus never looks like
 * selection. While you're alone every layout looks the same, so the options are disabled with a hint.
 */
export function LayoutPicker({
  layout,
  onLayout,
  alone,
  size = "md"
}: {
  layout: LayoutMode;
  onLayout: (mode: LayoutMode) => void;
  alone: boolean;
  /** md = 36px (desktop menu); touch = 40px (phone sheet). */
  size?: "md" | "touch";
}) {
  const [hovered, setHovered] = useState<LayoutMode | null>(null);
  const shown = LAYOUT_OPTIONS.find((o) => o.mode === (hovered ?? layout)) ?? LAYOUT_OPTIONS[0];

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = rovingIndex(index, event.key, LAYOUT_OPTIONS.map(() => alone));
    if (next === null) return;
    event.preventDefault();
    onLayout(LAYOUT_OPTIONS[next].mode);
    const sibling = event.currentTarget.parentElement?.children[next];
    if (sibling instanceof HTMLElement) sibling.focus();
  }

  return (
    <div className="px-1.5">
      <div
        role="radiogroup"
        aria-label="Layout"
        aria-describedby="layout-hint"
        className={cn("grid grid-cols-4 gap-0.5 rounded-md border border-input p-0.5", size === "touch" ? "h-10" : "h-9")}
      >
        {LAYOUT_OPTIONS.map(({ mode, label, description }, index) => {
          const selected = layout === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              disabled={alone}
              title={description}
              onClick={() => onLayout(mode)}
              onKeyDown={(event) => onKeyDown(event, index)}
              onPointerEnter={() => setHovered(mode)}
              onPointerLeave={() => setHovered(null)}
              className={cn(
                "inline-flex min-w-0 items-center justify-center rounded-sm px-1.5 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-green)]",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "bg-[var(--brand-fill)] text-[var(--on-brand)]"
                  : "text-muted-foreground hover:bg-[var(--ink-3)] hover:text-foreground"
              )}
            >
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
      <p id="layout-hint" className="pt-1.5 text-xs text-muted-foreground" aria-live="polite">
        {alone ? LAYOUT_ALONE_HINT : shown.description}
      </p>
    </div>
  );
}
