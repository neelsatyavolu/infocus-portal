"use client";

import { memo } from "react";
import { StatusTag } from "@/components/kit/status-tag";
import { DAY_PANEL_ID, formatLongDate, type DayFailure, type DayModel } from "@/components/master-calendar/calendar-model";
import { dayAccessibleLabel } from "@/components/master-calendar/day-cell";
import { cn } from "@/src/lib/utils";

/** A day's button inside a run bar (its agenda row keeps the plain `master-calendar-day-…` id). */
export function runDayButtonId(dateKey: string) {
  return `master-calendar-day-${dateKey}-run`;
}

/**
 * A run of days off in the month grid (from 58rem of board width): one short bar that prints the
 * dates and the label once. Each day is still its own button, one column of the bar, so any day
 * can be clicked, tabbed to or stepped to with J/K, and shows hover and selection on its column.
 */
export const HolidayRunBar = memo(function HolidayRunBar({
  days,
  label,
  selectedDate,
  showSelection,
  savingDates,
  failedDates,
  onSelect
}: {
  days: DayModel[];
  label: string;
  selectedDate: string | null;
  showSelection: boolean;
  savingDates: ReadonlySet<string>;
  failedDates: Readonly<Record<string, DayFailure>>;
  onSelect: (dateKey: string, fromKeyboard: boolean) => void;
}) {
  const first = days[0];
  const last = days[days.length - 1];
  const failed = days.some((day) => failedDates[day.dateKey]?.kind === "save");
  const saving = days.some((day) => savingDates.has(day.dateKey));

  return (
    <div
      className="relative hidden min-h-12 bg-background @min-[58rem]:grid"
      style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
    >
      {days.map((day, index) => {
        const selected = showSelection && day.dateKey === selectedDate;
        const status = { saving: savingDates.has(day.dateKey), failed: failedDates[day.dateKey]?.kind === "save" };
        return (
          <button
            key={day.dateKey}
            type="button"
            id={runDayButtonId(day.dateKey)}
            aria-label={dayAccessibleLabel(day, status)}
            aria-controls={selected ? DAY_PANEL_ID : undefined}
            title={formatLongDate(day.dateKey)}
            // detail 0: Enter or Space (or a screen reader), not a pointer click.
            onClick={(event) => onSelect(day.dateKey, event.detail === 0)}
            style={{ gridColumnStart: index + 1 }}
            className={cn(
              "relative row-start-1 min-w-0 transition-colors hover:bg-[var(--ink-3)]",
              "after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring",
              selected ? "bg-[var(--ink-3)] outline-2 -outline-offset-2 outline-[var(--brand-green)]" : "outline-none"
            )}
          />
        );
      })}
      {/* Drawn once over the day columns; clicks pass through to the day under the pointer. */}
      <div aria-hidden className="pointer-events-none relative col-span-full row-start-1 flex min-w-0 items-start gap-2 p-3">
        <span className="flex h-6 shrink-0 items-center px-1 text-sm font-semibold leading-none tabular-nums text-foreground">
          {Number(first.dateKey.slice(8))}–{Number(last.dateKey.slice(8))}
        </span>
        <span className="min-w-0 truncate text-[13px] font-semibold leading-6 text-muted-foreground">{label}</span>
        {failed ? (
          <span className="flex h-6 shrink-0 items-center">
            <StatusTag tone="danger">Not saved</StatusTag>
          </span>
        ) : saving ? (
          <span className="flex h-6 shrink-0 items-center">
            <StatusTag tone="neutral" spinner>
              Saving…
            </StatusTag>
          </span>
        ) : null}
      </div>
    </div>
  );
});
