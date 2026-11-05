"use client";

import { SegmentedControl } from "@/components/kit/segmented-control";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import { CommentButton, ParticipationLegend, ScoreInput } from "./participation-cells";
import { type WeekGridProps, studentName, weekTotal } from "./participation-grid";
import { WEEKDAY_LABELS, WEEKDAY_NAMES, cellChanged, entryKey, normalizeNote } from "./participation-week";

/**
 * The week on phones and tablets (below lg): the card header picks the day (with its max and
 * "Full" for everyone that day beside it), then one row per student with that day's score, its
 * comment and "Full week". Rows sit two across from md so a tablet has no empty middle. Off days
 * only appear when they hold something or "Show off days" is on. The day header sticks under the
 * top bar. Below sm the day buttons drop the date number so the max and Full still fit one row.
 */
export function ParticipationDayList({
  dayKey,
  onDayChange,
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
}: WeekGridProps & { dayKey: string | null; onDayChange: (dateKey: string) => void }) {
  const day = columns.find((column) => column.dateKey === dayKey) ?? null;
  const weekday = day ? WEEKDAY_LABELS[day.date.getDay()] : "";
  const max = day?.max ?? 0;

  return (
    <div className="min-w-0 space-y-3">
      <section aria-label={day ? `${WEEKDAY_NAMES[day.date.getDay()]} scores` : "Scores"} className="min-w-0 overflow-clip rounded-md border border-border bg-card">
        {columns.length > 0 ? (
          // Sticks under the top bar (overflow-clip, not hidden, so it can), keeping the day in view down a long roster.
          <header className="sticky top-[var(--app-header-h,0px)] z-10 flex min-w-0 items-center gap-2 border-b border-border bg-card px-4 py-3">
            <SegmentedControl
              ariaLabel="Day"
              size="touch"
              value={dayKey ?? ""}
              onChange={onDayChange}
              className="min-w-0 shrink"
              options={columns.map((column) => ({
                value: column.dateKey,
                title: column.graded ? `${WEEKDAY_NAMES[column.date.getDay()]} · max ${column.max}` : `${WEEKDAY_NAMES[column.date.getDay()]} · off`,
                label: (
                  <>
                    {WEEKDAY_LABELS[column.date.getDay()]}
                    <span className="font-mono-broadcast text-[13px] tabular-nums max-sm:hidden">{column.date.getDate()}</span>
                  </>
                )
              }))}
            />
            {day?.graded ? (
              <>
                <span className="ml-auto shrink-0 font-mono-broadcast text-xs tabular-nums text-muted-foreground">
                  max {day.max}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 shrink-0 px-3 md:h-9"
                  title={`Give everyone full marks (${day.max}) for ${WEEKDAY_NAMES[day.date.getDay()]}`}
                  aria-label={`Give everyone full marks for ${weekday}`}
                  onClick={() => onFillDay(day.dateKey)}
                >
                  Full
                </Button>
              </>
            ) : day ? (
              <span className="ml-auto flex shrink-0 items-center">
                <StatusTag tone="muted" size="sm">
                  Off
                </StatusTag>
              </span>
            ) : null}
          </header>
        ) : null}
        <ul className="-mb-px grid min-w-0 md:grid-cols-2 md:[&>li:nth-child(odd)]:border-r md:[&>li:nth-child(odd)]:border-border">
          {students.map((student) => {
            const name = studentName(student);
            const key = day ? entryKey(student.id, day.dateKey) : "";
            const points = day ? drafts.points[key] : undefined;
            const hasNote = day ? normalizeNote(drafts.notes[key]).length > 0 : false;
            const total = weekTotal(student.id, allDays, drafts);
            return (
              <li key={student.id} className="flex min-h-14 min-w-0 items-center gap-2 border-b border-border px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] text-foreground" title={student.email ?? undefined}>
                    {name}
                  </p>
                  <p
                    className={cn(
                      "font-mono-broadcast text-xs tabular-nums",
                      weekPossible > 0 && total === weekPossible ? "text-[var(--brand-green)]" : "text-muted-foreground"
                    )}
                  >
                    Week {total} / {weekPossible}
                  </p>
                </div>
                {day ? (
                  // Off days (max 0) keep the field too, as before: a 0 there lets a comment post that day.
                  <>
                    <ScoreInput
                      value={points}
                      max={max}
                      onChange={(raw) => onSetPoints(student.id, day.dateKey, raw)}
                      label={`Score for ${name} on ${weekday}`}
                      pending={pendingByKey.get(key)}
                      unsaved={cellChanged(drafts, baseline, key)}
                      size="touch"
                    />
                    <CommentButton
                      hasNote={hasNote}
                      hasScore={points !== undefined}
                      max={max}
                      studentName={name}
                      dayLabel={weekday}
                      onOpen={() => onOpenComment(student.id, day.dateKey)}
                      size="touch"
                    />
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 shrink-0 px-2.5"
                  aria-label={`Full marks for ${name}'s week`}
                  onClick={() => onFillWeek(student.id)}
                >
                  Full week
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      <ParticipationLegend offDays={offDayLabels} />
    </div>
  );
}
