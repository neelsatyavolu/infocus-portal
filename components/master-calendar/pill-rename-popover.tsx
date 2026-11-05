"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Anchor } from "@/components/master-calendar/calendar-model";
import { dismissListeners, fixedPopoverStyle } from "@/components/master-calendar/popover-position";

const SIZE = { width: 288, height: 168 };
/** 32px buttons with a mouse, 40px on touch screens. */
const TOUCH = "pointer-coarse:h-10";

/** Rename a package pill's label (the file name stays the same) or remove the pill. */
export function PillRenamePopover({
  anchor,
  initialLabel,
  onSave,
  onRemove,
  onCancel
}: {
  anchor: Anchor;
  initialLabel: string;
  onSave: (label: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialLabel);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputId = useId();

  useEffect(() => dismissListeners(() => containerRef.current, onCancel), [onCancel]);

  function commit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSave(trimmed);
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-labelledby={`${inputId}-label`}
      className="fixed z-50 w-72 space-y-3 rounded-md border border-border bg-popover p-3 text-popover-foreground"
      style={fixedPopoverStyle(anchor, SIZE)}
    >
      <div className="space-y-1">
        <label
          id={`${inputId}-label`}
          htmlFor={inputId}
          className="block text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground"
        >
          Rename pill
        </label>
        <input
          id={inputId}
          autoFocus
          type="text"
          value={value}
          aria-describedby={`${inputId}-hint`}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
        />
        <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
          The file name stays the same.
        </p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Button type="button" size="sm" variant="destructive-quiet" onClick={onRemove} className={TOUCH}>
          Remove pill
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel} className={TOUCH}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={commit} className={TOUCH}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
