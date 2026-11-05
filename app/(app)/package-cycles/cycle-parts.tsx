import type { ReactNode } from "react";
import { StatusTag } from "@/components/kit/status-tag";
import { cycleSemesterTerm } from "@/src/lib/package-grades";
import { cn } from "@/src/lib/utils";
import {
  SECTION_LABEL,
  SECTION_TONE,
  STAGE_FIELDS,
  cycleMonth,
  type CycleSection,
  type PackageCycle
} from "./cycle-dates-utils";

/**
 * Pieces shared by the read-only schedule and the editor, so a cycle's row looks and lines up
 * the same in both modes (same columns, same cycle cell, same current-row mark).
 */

/**
 * Both modes measure the same box: each mode's root is the `dates` container (the full width of
 * the Stage dates section). The read view's table shows from 45rem (a 768px tablet, where each
 * stage column still fits "Thu, Oct 16"); cycle cards below. The editor's table of date fields
 * needs 64rem, so it shows only where it fits whole (64rem plus the box's 2px border) and never
 * scrolls sideways; narrower boxes (tablets, most laptops, phones) get one form card per cycle.
 */
export const DATES_CONTAINER = "@container/dates";
export const TABLE_ONLY = "hidden @min-[45rem]/dates:block";
export const CARDS_ONLY = "@min-[45rem]/dates:hidden";
export const EDITOR_TABLE_ONLY = "hidden @min-[64.125rem]/dates:block";
export const EDITOR_CARDS_ONLY = "@min-[64.125rem]/dates:hidden";

/** Remembers whether closed cycles are unfolded; the schedule and the card editor share it. */
export const CLOSED_CYCLES_STORAGE_KEY = "cycle-dates:show-closed:v1";

/** The current cycle's tint (DESIGN: a selected row is a 10–18% tint). */
export const CURRENT_TINT = "bg-[var(--brand-green)]/10";

export const LABEL_TEXT = "text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground";

/** The 3px green bar at the left edge of the current cycle (the kit's active-row bar). */
export function CurrentBar() {
  return <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--brand-green)]" />;
}

/** The S2 marker for cycles that belong to semester 2 (cycle 4 and later). */
export function SemesterTag({ cycleNumber }: { cycleNumber: number }) {
  if (cycleSemesterTerm(cycleNumber) !== 2) return null;
  return (
    <StatusTag tone="neutral" title="Semester 2">
      S2
    </StatusTag>
  );
}

/** Line 1 "Cycle 2 · October", line 2 the section tag, S2 and any `tags` (always two rows). */
export function CycleName({ cycle, section, tags }: { cycle: PackageCycle; section: CycleSection; tags?: ReactNode }) {
  const month = cycleMonth(cycle);
  return (
    <>
      <span className="flex min-h-5 min-w-0 items-baseline gap-1 whitespace-nowrap">
        <span className="text-sm font-semibold leading-5 text-foreground">Cycle {cycle.cycleNumber}</span>
        {month ? (
          <span title={month} className="min-w-0 truncate text-xs text-muted-foreground">
            · {month}
          </span>
        ) : null}
      </span>
      <span className="mt-1 flex min-h-5 flex-wrap items-center gap-1.5">
        <StatusTag tone={SECTION_TONE[section]}>{SECTION_LABEL[section]}</StatusTag>
        <SemesterTag cycleNumber={cycle.cycleNumber} />
        {tags}
      </span>
    </>
  );
}

const HEAD_CELL = cn(LABEL_TEXT, "px-2.5 pb-2.5 pt-3 text-left align-bottom");

/** Column widths: the cycle column, five equal stage columns, and the editor's Save column. */
export function ScheduleColumns({ withActions = false }: { withActions?: boolean }) {
  return (
    <colgroup>
      <col className="w-44" />
      {STAGE_FIELDS.map((stage) => (
        <col key={stage.key} />
      ))}
      {withActions ? <col className="w-28" /> : null}
    </colgroup>
  );
}

/**
 * Short stage names on screen; the full names for screen readers and on hover. `actionsLabel`
 * adds the editor's Save column.
 */
export function ScheduleHead({ actionsLabel }: { actionsLabel?: string }) {
  return (
    <thead>
      <tr>
        <th scope="col" className={cn(HEAD_CELL, "pl-4")}>
          Cycle
        </th>
        {STAGE_FIELDS.map((stage) => (
          <th key={stage.key} scope="col" title={stage.label} className={HEAD_CELL}>
            <span aria-hidden>{stage.short}</span>
            <span className="sr-only">{stage.label}</span>
          </th>
        ))}
        {actionsLabel ? (
          <th scope="col" className={cn(HEAD_CELL, "pr-4")}>
            <span className="sr-only">{actionsLabel}</span>
          </th>
        ) : null}
      </tr>
    </thead>
  );
}

/**
 * The "Closed 1" label row that starts the closed cycles' row group. The rule sits on the cell
 * too, because the editor's table separates its borders.
 */
export function ClosedGroupRow({ count, colSpan }: { count: number; colSpan: number }) {
  return (
    <tr className="border-t border-border">
      <th colSpan={colSpan} scope="rowgroup" className={cn(LABEL_TEXT, "border-t border-border py-2 pl-4 pr-3 text-left")}>
        Closed <span className="ml-1 font-mono-broadcast font-normal tabular-nums">{count}</span>
      </th>
    </tr>
  );
}
