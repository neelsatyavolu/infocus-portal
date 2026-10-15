"use client";

import { useRef } from "react";
import { TableShell } from "@/components/kit/data-table";
import { useAvailableHeight } from "@/components/kit/fill-viewport";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import { CommentButton, ParticipationLegend, ScoreInput } from "./participation-cells";
import {
  type DayColumn,
  type GridCells,
  type PendingItem,
  type Student,
  WEEKDAY_LABELS,
  cellChanged,
  entryKey,
  normalizeNote
} from "./participation-week";

export type WeekGridProps = {
  students: Student[];
  /** Graded days, plus off days that hold a real score or comment. */
  columns: DayColumn[];
  /** All five class days (the row total counts every one, as before). */
  allDays: DayColumn[];
  offDayLabels: string[];
  drafts: GridCells;
  baseline: GridCells;
  pendingByKey: Map<string, PendingItem>;
  weekPossible: number;
  onSetPoints: (userId: string, dateKey: string, raw: string) => void;
  onFillDay: (dateKey: string) => void;
  onFillWeek: (userId: string) => void;
  onOpenComment: (userId: string, dateKey: string) => void;
};

export function studentName(student: Student) {
  return student.name ?? student.email ?? "";
}

export function weekTotal(userId: string, days: DayColumn[], drafts: GridCells) {
  return days.reduce((total, day) => total + (drafts.points[entryKey(userId, day.dateKey)] ?? 0), 0);
}

const TODAY_TINT = "bg-[var(--brand-green)]/5";
/** The header cell stays opaque (it sticks over the rows), so the tint is layered on bg-card. */
const TODAY_HEAD_TINT = "bg-linear-to-b from-[var(--brand-green)]/5 to-[var(--brand-green)]/5";
/**
 * The table scrolls in its own box, so the day headers stay in view. Its height is measured to end
 * just above the Save bar (TABLE_RESERVE_PX: the bar, its gap and a little room), so the page
 * itself doesn't scroll; the fixed fallback applies until it's measured or on short screens.
 */
const TABLE_MAX_HEIGHT = "max(20rem, calc(100dvh - var(--app-header-h, 0px) - 10rem))";
const TABLE_RESERVE_PX = 104;

/** Every day column is the same fixed width, w-36 (score field, comment button and the header's Full). */
const DAY_COLUMN_REM = 9;

/**
 * The week as a table (lg and up): the legend on top, then one column per graded day (off days
 * drop out unless they hold something or "Show off days" is on), a total and a "Full week" action
 * per row. Day, Total and action columns are fixed widths and the student column takes the spare
 * width, so a row's scores, total and "Full week" sit together on the right. The header row
 * sticks while the rows scroll; the student column stays put when the table scrolls sideways.
 * Every control in the table is h-8 (h-10 on touch screens).
 */
export function ParticipationGrid({
  students,
  columns,
  allDays,
  offDayLabels,
  drafts,
  baseline,
  pendingByKey,
  weekPossible,
  onSetPoints,
  onFillDay,
  onFillWeek,
  onOpenComment
}: WeekGridProps) {
  // Student (at least 14rem) + the day columns + Total (6rem) + the row action (7.5rem).
  const minWidth = `${14 + columns.length * DAY_COLUMN_REM + 6 + 7.5}rem`;

  const tableTop = useRef<HTMLDivElement>(null);
  const fitHeight = useAvailableHeight(tableTop, TABLE_RESERVE_PX);

  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-border bg-card">
      <ParticipationLegend offDays={offDayLabels} className="border-b border-border px-3 py-2.5" />
      <div ref={tableTop} aria-hidden />
      <TableShell
        stickyFirstColumn
        minWidth={minWidth}
        maxHeight={fitHeight ? `${fitHeight}px` : TABLE_MAX_HEIGHT}
        caption="Participation scores for the week"
        className="rounded-none border-0 bg-transparent"
        tableClassName="table-fixed [&_tbody_tr:hover_td:first-child]:bg-[var(--ink-3)] [&_td]:py-2!"
      >
        <colgroup>
          {/* No width: the student column takes whatever the fixed columns leave. */}
          <col />
          {columns.map((column) => (
            <col key={column.dateKey} className="w-36" />
          ))}
          <col className="w-24" />
          <col className="w-30" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="h-auto! py-2! align-top!">
              <span className="flex h-5 items-center">Student</span>
            </th>
            {columns.map((column) => {
              const weekday = WEEKDAY_LABELS[column.date.getDay()];
              return (
                <th
                  key={column.dateKey}
                  scope="col"
                  className={cn("h-auto! py-2! align-top! text-center!", column.isToday && TODAY_HEAD_TINT)}
                >
                  <span className="flex flex-col items-center gap-1">
                    <span className="flex h-5 items-center gap-1.5">
                      {weekday}
                      {column.isToday ? (
                        <StatusTag tone="success" size="sm">
                          Today
                        </StatusTag>
                      ) : (
                        <span className="font-mono-broadcast tracking-normal tabular-nums">{column.date.getDate()}</span>
                      )}
                    </span>
                    {column.graded ? (
                      <span className="flex items-center gap-1 normal-case tracking-normal">
                        <span className="font-mono-broadcast tabular-nums">max {column.max}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 pointer-coarse:h-10"
                          aria-label={`Give everyone full marks for ${weekday}`}
                          onClick={() => onFillDay(column.dateKey)}
                        >
                          Full
                        </Button>
                      </span>
                    ) : (
                      <span className="flex h-8 items-center">
                        <StatusTag tone="muted" size="sm">
                          Off
                        </StatusTag>
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
            <th scope="col" className="h-auto! py-2! align-top! text-right!">
              <span className="flex h-5 items-center justify-end">Total</span>
            </th>
            <th scope="col" className="h-auto! py-2! align-top!">
              <span className="sr-only">Row actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => {
            const name = studentName(student);
            const total = weekTotal(student.id, allDays, drafts);
            return (
              <tr key={student.id}>
                <td>
                  <span className="block truncate text-sm text-foreground" title={student.email ?? undefined}>
                    {name}
                  </span>
                </td>
                {columns.map((column) => {
                  const key = entryKey(student.id, column.dateKey);
                  const points = drafts.points[key];
                  const hasNote = normalizeNote(drafts.notes[key]).length > 0;
                  const weekday = WEEKDAY_LABELS[column.date.getDay()];
                  const max = column.max ?? 0;
                  return (
                    <td key={column.dateKey} className={cn("text-center", column.isToday && TODAY_TINT)}>
                      {/* Off days (max 0) keep the field too, as before: a 0 there lets a comment post that day. */}
                      <span className="flex items-center justify-center gap-1">
                        <ScoreInput
                          value={points}
                          max={max}
                          onChange={(raw) => onSetPoints(student.id, column.dateKey, raw)}
                          label={`Score for ${name} on ${weekday}`}
                          pending={pendingByKey.get(key)}
                          unsaved={cellChanged(drafts, baseline, key)}
                          size="grid"
                        />
                        <CommentButton
                          hasNote={hasNote}
                          hasScore={points !== undefined}
                          max={max}
                          studentName={name}
                          dayLabel={weekday}
                          onOpen={() => onOpenComment(student.id, column.dateKey)}
                          size="grid"
                        />
                      </span>
                    </td>
                  );
                })}
                <td
                  className={cn(
                    "text-right font-mono-broadcast tabular-nums",
                    weekPossible > 0 && total === weekPossible ? "text-[var(--brand-green)]" : "text-foreground"
                  )}
                >
                  {total} / {weekPossible}
                </td>
                <td className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 pointer-coarse:h-10"
                    aria-label={`Full marks for ${name}'s week`}
                    onClick={() => onFillWeek(student.id)}
                  >
                    Full week
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
    </div>
  );
}
