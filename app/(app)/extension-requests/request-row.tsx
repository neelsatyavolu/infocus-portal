"use client";

import { ChevronDown } from "lucide-react";
import { StatusDot, StatusTag } from "@/components/kit/status-tag";
import { cn } from "@/src/lib/utils";
import type { RequestActions } from "./request-actions";
import { RequestDetail } from "./request-detail";
import { daysLabel, type RequestView } from "./request-view";

/**
 * One grid for the column header and every row, so values line up down the list. It switches on
 * when the list card (an `@container`) is at least 56rem wide: narrower, the Group and Next step
 * columns would cut off topics and tallies, so rows keep the two-line summary instead. A
 * container query, not a screen breakpoint, because the sidebar takes 240px from lg up.
 */
const ROW_GRID = "@4xl:grid-cols-[minmax(0,1.6fr)_3.5rem_4.5rem_minmax(0,1.3fr)_7.5rem_1rem]";

/** Label style for the column header and the Denied fold row. */
export const LIST_LABEL = "text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground";

const NEW_LABEL = "Updated since your last visit";

export function RequestListHeader() {
  return (
    <div aria-hidden className={cn("hidden min-h-9 items-center gap-x-4 border-b border-border px-4 @4xl:grid", ROW_GRID, LIST_LABEL)}>
      <span>Group</span>
      <span className="text-right">Cycle</span>
      <span className="text-right">Days</span>
      <span>Next step</span>
      <span>Status</span>
      <span />
    </div>
  );
}

function Summary({ view, open, isNew }: { view: RequestView; open: boolean; isNew: boolean }) {
  const { entry } = view;
  const by = entry.producerGranted && !view.filedByMember ? "Granted by" : "Requested by";
  return (
    <>
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-medium text-foreground">{view.title}</span>
          {entry.producerGranted ? <StatusTag tone="neutral">Exec grant</StatusTag> : null}
          {isNew ? (
            <span title={NEW_LABEL} className="flex shrink-0">
              <StatusDot tone="new" size={6} label={NEW_LABEL} />
            </span>
          ) : null}
        </span>
        <span className="hidden truncate text-[13px] text-muted-foreground @4xl:block">
          {view.hasTopic ? view.memberNames : `${by} ${view.requesterLabel}`}
        </span>
        <span className="block truncate text-[13px] text-muted-foreground @4xl:hidden">
          Cycle {entry.cycleNumber} · +{daysLabel(view.shownDays)} · {view.nextStep}
        </span>
      </span>
      <span className="hidden text-right font-mono-broadcast text-[13px] tabular-nums text-foreground @4xl:block">
        <span className="sr-only">Cycle </span>
        {entry.cycleNumber}
      </span>
      <span className="hidden text-right font-mono-broadcast text-[13px] tabular-nums text-foreground @4xl:block">
        +{view.shownDays}
        <span className="sr-only">{` ${view.shownDays === 1 ? "day" : "days"}`}</span>
      </span>
      <span className="hidden min-w-0 truncate text-sm text-[var(--ink-text)] @4xl:block">{view.nextStep}</span>
      <span className="flex justify-end @4xl:justify-start">
        <StatusTag tone={view.status.tone}>{view.status.label}</StatusTag>
      </span>
      <ChevronDown aria-hidden className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
    </>
  );
}

/**
 * One request: a full-width summary button (topic, cycle, days, next step, status) that opens
 * the detail below it. The open row carries a 3px green rule on its left edge and an Ink 3 fill on its
 * summary, like every other open or selected row in the Portal.
 */
export function RequestRow({
  view,
  open,
  isNew,
  onToggle,
  registerButton,
  actions
}: {
  view: RequestView;
  open: boolean;
  /** Something changed since the viewer's last visit. */
  isNew: boolean;
  onToggle: () => void;
  registerButton: (id: string, element: HTMLButtonElement | null) => void;
  actions: RequestActions;
}) {
  const id = view.entry.id;
  const summaryId = `extension-${id}-summary`;
  const panelId = `extension-${id}-detail`;
  return (
    <li
      className={cn(
        "relative",
        open && "before:absolute before:inset-y-0 before:left-0 before:z-[1] before:w-[3px] before:bg-[var(--brand-green)]"
      )}
    >
      <button
        ref={(element) => registerButton(id, element)}
        id={summaryId}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={onToggle}
        className={cn(
          // Below lg the window scrolls under the sticky top bar, so J/K and auto-advance keep the
          // row clear of it (from lg the shell's own scroller has scroll-padding for that).
          "relative grid min-h-14 w-full scroll-mb-[calc(var(--phone-tabbar-h,0px)+0.5rem)] max-lg:scroll-mt-[calc(var(--app-header-h,0px)+0.5rem)] grid-cols-[minmax(0,1fr)_auto_1rem] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-left transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring @4xl:gap-x-4",
          ROW_GRID,
          open && "bg-[var(--ink-3)]"
        )}
      >
        <Summary view={view} open={open} isNew={isNew} />
      </button>
      {open ? <RequestDetail view={view} panelId={panelId} labelledBy={summaryId} actions={actions} /> : null}
    </li>
  );
}
