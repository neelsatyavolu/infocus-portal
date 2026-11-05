"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CircleDashed, Pencil } from "lucide-react";
import { Spinner } from "@/components/kit/spinner";
import { StatusDot, StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import type { SectionStatus } from "./teleprompter-model";
import { PaneHeader, STICKY_TOP } from "./teleprompter-parts";

export type RundownItem = {
  id: string;
  code: string;
  beat: string | null;
  status: SectionStatus;
  editing: boolean;
  reformatting: boolean;
  updatedSinceVisit: boolean;
  /** "2h" — the section's last update, for the column's right edge. */
  age: string;
};

function itemLabel(item: RundownItem) {
  const parts = [item.beat ? `${item.code} ${item.beat}` : item.code];
  if (item.status === "to-fill") parts.push("to fill");
  if (item.status === "empty") parts.push("empty");
  if (item.editing) parts.push("editing");
  if (item.reformatting) parts.push("reformatting");
  if (item.updatedSinceVisit) parts.push("updated since your last visit");
  return parts.join(", ");
}

/** "Expand all" while any section is folded, otherwise "Collapse all". */
export function ExpandAllToggle({
  anyCollapsed,
  onSetAllCollapsed,
  className
}: {
  anyCollapsed: boolean;
  onSetAllCollapsed: (collapsed: boolean) => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("shrink-0 text-muted-foreground pointer-coarse:h-10", className)}
      onClick={() => onSetAllCollapsed(!anyCollapsed)}
    >
      {anyCollapsed ? "Expand all" : "Collapse all"}
    </Button>
  );
}

/** A chip's status as a small icon (shape, not just color); the words are in its aria-label. */
function ChipStatus({ item }: { item: RundownItem }) {
  if (item.reformatting) {
    return <Spinner size="sm" />;
  }
  if (item.editing) {
    return <Pencil className="h-3 w-3 shrink-0 text-[var(--brand-green)]" aria-hidden />;
  }
  if (item.status === "to-fill") {
    return <AlertTriangle className="h-3 w-3 shrink-0 text-[var(--brand-amber)]" aria-hidden />;
  }
  if (item.status === "empty") {
    return <CircleDashed className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />;
  }
  return null;
}

/**
 * Below 80rem: the rundown as a sideways-scrolling row of chips under the toolbar. `touch` (the
 * narrow layout) holds the chips and the trailing controls to one touch height (40px on phones,
 * 36px from md); otherwise they are 32px, or 40px on touch screens.
 */
export function RundownStrip({
  items,
  onJump,
  trailing,
  touch = false,
  className
}: {
  items: RundownItem[];
  onJump: (sectionId: string) => void;
  trailing?: ReactNode;
  touch?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex h-12 items-center gap-2 px-4", className)}>
      <nav aria-label="Rundown" className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ol className="flex w-max items-center gap-1.5 py-1">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onJump(item.id)}
                aria-label={itemLabel(item)}
                className={cn(
                  "inline-flex max-w-[14rem] items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  touch ? "h-10 md:h-9" : "h-8 pointer-coarse:h-10",
                  item.editing ? "border-[var(--brand-green)]/60" : "border-border"
                )}
              >
                <span className="shrink-0 font-mono-broadcast font-medium tabular-nums text-foreground">{item.code}</span>
                {item.beat ? <span className="min-w-0 truncate text-[var(--ink-text)]">{item.beat}</span> : null}
                <ChipStatus item={item} />
                {item.updatedSinceVisit ? <StatusDot tone="new" size={6} /> : null}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  );
}

function RundownRowStatus({ item }: { item: RundownItem }) {
  if (item.editing) {
    return (
      <StatusTag tone="info" size="sm">
        Editing
      </StatusTag>
    );
  }
  if (item.reformatting) {
    return (
      <StatusTag tone="neutral" size="sm" spinner>
        Reformatting
      </StatusTag>
    );
  }
  if (item.status === "to-fill") {
    return (
      <StatusTag tone="warning" size="sm">
        To fill
      </StatusTag>
    );
  }
  if (item.status === "empty") {
    return (
      <StatusTag tone="neutral" size="sm">
        Empty
      </StatusTag>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono-broadcast text-[11px] tabular-nums",
        item.updatedSinceVisit ? "text-[var(--brand-green)]" : "text-muted-foreground"
      )}
    >
      {item.updatedSinceVisit ? <StatusDot tone="new" size={6} /> : null}
      {item.age}
    </span>
  );
}

/** 80rem and wider: the rundown as a sticky column of rows with each section's status. */
export function RundownColumn({
  items,
  onJump,
  anyCollapsed,
  onSetAllCollapsed
}: {
  items: RundownItem[];
  onJump: (sectionId: string) => void;
  anyCollapsed: boolean;
  onSetAllCollapsed: (collapsed: boolean) => void;
}) {
  return (
    <aside aria-label="Rundown" className="min-w-0 border-l border-border">
      <div className={cn("sticky flex max-h-[calc(100dvh-var(--app-header-h,0px))] flex-col", STICKY_TOP)}>
        <PaneHeader
          label="Rundown"
          count={items.length}
          actions={items.length > 0 ? <ExpandAllToggle anyCollapsed={anyCollapsed} onSetAllCollapsed={onSetAllCollapsed} /> : null}
        />
        {items.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">Sections appear here as you add them.</p>
        ) : (
          <ol className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onJump(item.id)}
                  aria-label={itemLabel(item)}
                  className="grid h-10 w-full grid-cols-[var(--tp-code-w,2ch)_minmax(0,1fr)_auto] items-center gap-2 px-3 text-left text-[13px] transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="truncate font-mono-broadcast text-xs font-medium tabular-nums text-foreground">{item.code}</span>
                  <span className="truncate text-[var(--ink-text)]">{item.beat ?? ""}</span>
                  <RundownRowStatus item={item} />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}
