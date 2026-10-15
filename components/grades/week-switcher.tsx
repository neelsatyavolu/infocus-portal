"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { ButtonGroup } from "@/components/kit/button-group";
import { buttonVariants } from "@/components/ui/button";
import type { GradebookWeek } from "@/src/lib/student-gradebook";
import { cn } from "@/src/lib/utils";

const STEP_CLASS = cn(buttonVariants({ variant: "outline", size: "icon" }), "aspect-square w-auto px-0");

/**
 * [‹ week ›] as one joined control: 40px on phones, 36px from md, every part the same height.
 * The select is a real field (field border, normal case), and fills the width it's given.
 */
export function WeekSwitcher({
  weeks,
  weekIndex,
  onWeekIndex,
  newIndexes,
  className
}: {
  weeks: GradebookWeek[];
  weekIndex: number;
  onWeekIndex: (index: number) => void;
  /** Weeks changed since the last visit; their options read "… (new)". */
  newIndexes?: ReadonlySet<number>;
  className?: string;
}) {
  const empty = weeks.length === 0;
  return (
    <ButtonGroup size="touch" className={cn("flex w-full", className)}>
      <button
        type="button"
        aria-label="Previous week"
        title="Previous week (←)"
        disabled={weekIndex <= 0}
        onClick={() => onWeekIndex(Math.max(0, weekIndex - 1))}
        className={STEP_CLASS}
      >
        <ChevronLeft aria-hidden />
      </button>
      <div className="min-w-0 flex-1 focus-within:z-10">
        <label className="sr-only" htmlFor="grades-week-switcher">
          Week
        </label>
        <select
          id="grades-week-switcher"
          value={weekIndex}
          disabled={empty}
          onChange={(event) => onWeekIndex(Number(event.target.value))}
          className="h-full w-full min-w-0 appearance-none truncate rounded-none border border-input bg-transparent pl-3 pr-8 text-base text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm [&>option]:bg-popover [&>option]:text-popover-foreground"
        >
          {empty ? <option value={0}>No weeks yet</option> : null}
          {weeks.map((entry, index) => (
            <option key={entry.weekStart} value={index}>
              {newIndexes?.has(index) ? `${entry.label} (new)` : entry.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
      </div>
      <button
        type="button"
        aria-label="Next week"
        title="Next week (→)"
        disabled={weekIndex >= weeks.length - 1}
        onClick={() => onWeekIndex(Math.min(weeks.length - 1, weekIndex + 1))}
        className={STEP_CLASS}
      >
        <ChevronRight aria-hidden />
      </button>
    </ButtonGroup>
  );
}
