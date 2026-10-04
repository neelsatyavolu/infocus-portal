"use client";

import { useState } from "react";
import { Check } from "lucide-react";
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
 * Segmented radio group. Selected = InFocus Green fill + check (aria-checked); keyboard focus
 * gets a separate offset ring (focus-visible only), so focus never looks like selection.
 * While you're alone every layout looks the same, so the options are disabled with a hint.
 */
export function LayoutPicker({
  layout,
  onLayout,
  alone
}: {
  layout: LayoutMode;
  onLayout: (mode: LayoutMode) => void;
  alone: boolean;
}) {
  const [hovered, setHovered] = useState<LayoutMode | null>(null);
  const shown = LAYOUT_OPTIONS.find((o) => o.mode === (hovered ?? layout)) ?? LAYOUT_OPTIONS[0];

  return (
    <div role="radiogroup" aria-label="Layout" aria-describedby="layout-hint" className="px-1">
      <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Layout</p>
      <div className="grid grid-cols-4 gap-1">
        {LAYOUT_OPTIONS.map(({ mode, label, description }) => {
          const selected = layout === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={alone}
              title={description}
              onClick={() => onLayout(mode)}
              onPointerEnter={() => setHovered(mode)}
              onPointerLeave={() => setHovered(null)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink-2)]",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground outline outline-1 outline-[var(--ink-4)] hover:bg-[var(--ink-3)] hover:text-foreground"
              )}
            >
              {selected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
              {label}
            </button>
          );
        })}
      </div>
      <p id="layout-hint" className="px-2 pt-1.5 text-xs text-muted-foreground" aria-live="polite">
        {alone ? LAYOUT_ALONE_HINT : shown.description}
      </p>
    </div>
  );
}
