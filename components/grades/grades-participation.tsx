"use client";

import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { NewTag } from "@/components/grades/grade-parts";
import { classDaysOf, dayKindLabel, shortDateFromKey } from "@/components/grades/grade-math";
import { weekSeenKey } from "@/components/grades/grades-seen";
import { WeekSwitcher } from "@/components/grades/week-switcher";
import type { GradebookDay, GradebookWeek } from "@/src/lib/student-gradebook";
import { cn } from "@/src/lib/utils";

/**
 * Participation, one week at a time: the week switcher, the week's tag and points, then one
 * aligned row per class day (date, kind tag, points; schedule label and note underneath).
 * Weeks changed since the last visit are marked in the switcher, and when the open week isn't one
 * of them, a line under the switcher points to the latest one (the plate may name it).
 */
export function GradesParticipation({
  weeks,
  weekIndex,
  onWeekIndex,
  newKeys,
  className
}: {
  weeks: GradebookWeek[];
  weekIndex: number;
  onWeekIndex: (index: number) => void;
  newKeys: ReadonlySet<string>;
  /** Grid placement from the Overview (grades-layout.ts). */
  className?: string;
}) {
  const week = weeks[weekIndex] ?? null;
  const days = classDaysOf(week);
  const isNew = week ? newKeys.has(weekSeenKey(week.weekStart)) : false;
  const newIndexes = new Set(
    weeks.flatMap((entry, index) => (newKeys.has(weekSeenKey(entry.weekStart)) ? [index] : []))
  );
  // Weeks run oldest first, so the highest index is the latest changed week.
  const pointerIndex = !isNew && newIndexes.size > 0 ? Math.max(...newIndexes) : null;
  const pointerWeek = pointerIndex === null ? null : weeks[pointerIndex];

  return (
    <Panel
      id="grades-participation"
      title="Participation"
      titleAs="h2"
      status={isNew ? <NewTag /> : null}
      className={cn("scroll-mt-20", className)}
      bodyClassName="flex flex-col gap-4"
      footer={<span>Mon 10 · Tue/Thu 20 · holidays off</span>}
    >
      <WeekSwitcher weeks={weeks} weekIndex={weekIndex} onWeekIndex={onWeekIndex} newIndexes={newIndexes} />

      {pointerIndex !== null && pointerWeek ? (
        <div className="-mt-2 flex min-h-8 min-w-0 items-center gap-2">
          <NewTag />
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            Week of {shortDateFromKey(pointerWeek.weekStart)}
          </span>
          <button
            type="button"
            onClick={() => onWeekIndex(pointerIndex)}
            aria-label={`View the week of ${shortDateFromKey(pointerWeek.weekStart)}`}
            className="ml-auto inline-flex h-10 shrink-0 items-center rounded-sm text-xs font-medium text-[var(--brand-green)] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
          >
            View
          </button>
        </div>
      ) : null}

      {!week ? (
        <EmptyState size="inline" icon={CalendarDays} title="No participation weeks in this semester yet." className="px-0 py-1" />
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <StatusTag tone={week.graded ? "success" : "neutral"}>{week.graded ? "Graded" : "Not graded yet"}</StatusTag>
              <p className="text-xs text-muted-foreground">
                {week.fullPossible > 0 ? `${week.fullPossible} pts possible` : "No class days"}
              </p>
            </div>
            <p className="shrink-0 text-right font-mono-broadcast text-2xl font-medium leading-tight tabular-nums text-foreground">
              {week.graded ? (
                <>
                  {week.earned}
                  <span className="text-base text-muted-foreground"> / {week.possible}</span>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
          </div>

          {days.length === 0 ? (
            <p className="text-sm text-muted-foreground">No class days this week.</p>
          ) : (
            <ul aria-label={`Class days, ${week.label}`} className="divide-y divide-border border-t border-border">
              {days.map((day) => (
                <DayRow key={day.date} day={day} />
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

function DayRow({ day }: { day: GradebookDay }) {
  const kind = dayKindLabel(day);
  const quiet = kind === "Holiday" || kind === "Off";
  return (
    <li className="py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-24 shrink-0 text-sm font-medium text-foreground">
          {day.weekday}, {shortDateFromKey(day.date)}
        </span>
        <StatusTag size="sm" tone={quiet ? "muted" : "neutral"}>
          {kind}
        </StatusTag>
        <span className="ml-auto shrink-0 font-mono-broadcast text-sm tabular-nums">
          <span className={day.points === null ? "text-muted-foreground" : "text-foreground"}>{day.points ?? "—"}</span>
          <span className="text-muted-foreground"> / {day.maxPoints}</span>
        </span>
      </div>
      {day.label ? <p className="mt-0.5 text-xs text-muted-foreground">{day.label}</p> : null}
      {day.notes ? (
        <p className="mt-0.5 text-xs text-foreground">
          <span className="text-muted-foreground">Note · </span>
          {day.notes}
        </p>
      ) : null}
    </li>
  );
}
