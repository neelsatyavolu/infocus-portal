import {
  isNoMondayClass,
  isSeededHoliday,
  utcWeekdayFromDateKey,
  type ScheduleKind
} from "@/src/lib/school-schedule";

/** SchoolCalendarDay.source for class days Paly's bell schedule skips (no 1st period). */
export const BELL_FEED_SOURCE = "bell";
export const NO_CLASS_LABEL = "No class (no 1st period)";

export type NoClassDay = { date: string; kind: ScheduleKind; label: string };

/**
 * The calendar day for a date InFocus would meet but 1st period does not: a Monday has no PA
 * (NONE), a Tuesday or Thursday has no class (HOLIDAY, so it is worth 0). Wed/Fri shows do not
 * depend on 1st period and are left alone.
 */
export function noClassDay(date: string): NoClassDay | null {
  const weekday = utcWeekdayFromDateKey(date);
  if (weekday === 1) return { date, kind: "NONE", label: NO_CLASS_LABEL };
  if (weekday === 2 || weekday === 4) return { date, kind: "HOLIDAY", label: NO_CLASS_LABEL };
  return null;
}

/**
 * Which no-class days a sync should write and remove. Days already off (built-in holidays,
 * finals, summer, set by hand) keep their own row. Past rows are never removed.
 */
export function planNoClassSync(input: {
  noPeriodOneDates: readonly string[];
  existing: ReadonlyArray<{ date: string; source: string }>;
  /** YYYY-MM-DD. */
  today: string;
}): { upsert: NoClassDay[]; remove: string[] } {
  const sourceByDate = new Map(input.existing.map((row) => [row.date, row.source]));
  const desired = input.noPeriodOneDates
    .filter((date) => !isSeededHoliday(date) && !isNoMondayClass(date))
    .flatMap((date) => noClassDay(date) ?? []);
  const wanted = new Set(desired.map((day) => day.date));
  return {
    upsert: desired.filter((day) => (sourceByDate.get(day.date) ?? BELL_FEED_SOURCE) === BELL_FEED_SOURCE),
    remove: input.existing
      .filter((row) => row.source === BELL_FEED_SOURCE && row.date >= input.today && !wanted.has(row.date))
      .map((row) => row.date)
      .sort()
  };
}
