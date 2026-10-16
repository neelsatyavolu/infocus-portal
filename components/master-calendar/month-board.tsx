"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { WEEKDAYS, groupHolidayRuns, type DayFailure, type DayModel, type WeekRow } from "@/components/master-calendar/calendar-model";
import { DayCell } from "@/components/master-calendar/day-cell";
import { HolidayRunBar } from "@/components/master-calendar/holiday-run";
import { cn } from "@/src/lib/utils";

const LABEL_CLASS = "text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground";

/** Grid columns a run of days off spans (written out in full so Tailwind finds them). */
const RUN_SPAN: Record<number, string> = {
  2: "@min-[58rem]:col-span-2",
  3: "@min-[58rem]:col-span-3",
  4: "@min-[58rem]:col-span-4",
  5: "@min-[58rem]:col-span-5"
};

/**
 * The month. It is its own container: from 58rem wide it is one framed 5-column grid (weekday
 * labels in the same frame, 1px lines, equal-height weeks; 11.6rem a column, so label and value
 * lines stay on one row); narrower it is an agenda, one card of day rows per week. Same DOM
 * either way; week wrappers become `display: contents` in the grid. In the grid, a run of days
 * off with the same label is one short bar; in the agenda each of those days keeps its row.
 * The agenda opens at this week: weeks already over fold behind one "Earlier" button (the grid
 * shows the whole month, so it never folds).
 */
export function MonthBoard({
  rows,
  loading,
  selectedDate,
  showSelection,
  canEdit,
  savingDates,
  failedDates,
  onSelect,
  onImageMenu
}: {
  rows: WeekRow[];
  loading: boolean;
  selectedDate: string | null;
  showSelection: boolean;
  canEdit: boolean;
  savingDates: ReadonlySet<string>;
  failedDates: Readonly<Record<string, DayFailure>>;
  onSelect: (dateKey: string, fromKeyboard: boolean) => void;
  onImageMenu?: (dateKey: string, event: MouseEvent<HTMLDivElement>) => void;
}) {
  const [earlierOpen, setEarlierOpen] = useState(false);
  const boardRows = useMemo(() => rows.map((row) => ({ ...row, cells: groupHolidayRuns(row.segments) })), [rows]);
  // Weeks whose days are all over, before the first week that still has a day to come.
  const firstCurrent = rows.findIndex((row) => row.days.some((day) => !day.isPast));
  const pastCount = firstCurrent === -1 ? 0 : firstCurrent;
  const pastDates = new Set(rows.slice(0, pastCount).flatMap((row) => row.days.map((day) => day.dateKey)));
  // Stepping or Today onto an earlier day opens them, so the picked day is always on the board.
  const foldEarlier = pastCount > 0 && !earlierOpen && !(selectedDate && pastDates.has(selectedDate));

  function renderDay(day: DayModel) {
    return (
      <DayCell
        key={day.dateKey}
        day={day}
        saving={savingDates.has(day.dateKey)}
        failed={failedDates[day.dateKey]?.kind === "save"}
        selected={day.dateKey === selectedDate}
        showSelection={showSelection}
        canEdit={canEdit}
        onSelect={onSelect}
        onImageMenu={canEdit ? onImageMenu : undefined}
      />
    );
  }

  return (
    <div
      aria-busy={loading || undefined}
      className={cn("@container min-w-0 transition-opacity", loading && "opacity-60")}
    >
      <div className="space-y-5 @min-[58rem]:grid @min-[58rem]:grid-cols-5 @min-[58rem]:gap-px @min-[58rem]:space-y-0 @min-[58rem]:overflow-hidden @min-[58rem]:rounded-md @min-[58rem]:border @min-[58rem]:border-border @min-[58rem]:bg-border">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} aria-hidden className={cn("hidden h-8 items-center bg-card px-3 @min-[58rem]:flex", LABEL_CLASS)}>
            {weekday}
          </div>
        ))}

        {foldEarlier ? (
          <button
            type="button"
            onClick={() => setEarlierOpen(true)}
            className={cn(
              "flex h-8 w-full items-center rounded-md border border-dashed border-border px-3 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @min-[58rem]:hidden",
              LABEL_CLASS
            )}
          >
            {pastCount === 1 ? `Show last week (${rows[0].label})` : `Show ${pastCount} earlier weeks`}
          </button>
        ) : null}

        {boardRows.map((row, index) => (
          <section
            key={row.key}
            id={`master-calendar-${row.key}`}
            aria-label={row.hasToday ? `This week, ${row.label}` : `Week of ${row.label}`}
            className={cn(
              "scroll-mt-[calc(var(--app-header-h,3.5rem)+0.75rem)] space-y-2 @min-[58rem]:contents",
              foldEarlier && index < pastCount && "@max-[58rem]:hidden"
            )}
          >
            <h2 className={cn("flex h-8 items-center gap-2 @min-[58rem]:hidden", LABEL_CLASS)}>
              {row.hasToday ? (
                <>
                  <span className="text-[var(--brand-green)]">This week</span>
                  <span aria-hidden>·</span>
                </>
              ) : null}
              {row.label}
            </h2>
            <div className="divide-y divide-border overflow-hidden rounded-md border border-border @min-[58rem]:contents @min-[58rem]:divide-y-0">
              {row.cells.map((segment) => {
                if (segment.type === "blank") {
                  return <div key={segment.key} aria-hidden className="hidden bg-background @min-[58rem]:block" />;
                }
                if (segment.type === "run") {
                  return (
                    <div key={segment.key} className={cn("min-w-0 @min-[58rem]:grid", RUN_SPAN[segment.days.length])}>
                      <div className="divide-y divide-border @min-[58rem]:hidden">{segment.days.map(renderDay)}</div>
                      <HolidayRunBar
                        days={segment.days}
                        label={segment.label}
                        selectedDate={selectedDate}
                        showSelection={showSelection}
                        savingDates={savingDates}
                        failedDates={failedDates}
                        onSelect={onSelect}
                      />
                    </div>
                  );
                }
                return renderDay(segment.day);
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
