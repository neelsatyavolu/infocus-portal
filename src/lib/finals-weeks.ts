import { isSeededHoliday, utcWeekdayFromDateKey } from "@/src/lib/school-schedule";
import { addDaysToDateKey } from "@/src/lib/show-assignment";

/** Calendar label for a day in a finals week. */
export const FINALS_WEEK_LABEL = "Finals week";
/** SchoolCalendarDay.source for days written from the Paly feed. Hand-set days are "manual". */
export const FINALS_FEED_SOURCE = "feed";

/**
 * InFocus does not air shows, read PA or score participation in a finals week:
 * Monday to Friday of every week that contains a finals day.
 */
export function finalsWeekDays(finalsDates: readonly string[]): string[] {
  const days = new Set<string>();
  for (const date of finalsDates) {
    const weekday = utcWeekdayFromDateKey(date);
    if (weekday === 0 || weekday === 6) continue;
    const monday = addDaysToDateKey(date, 1 - weekday);
    for (let offset = 0; offset < 5; offset += 1) {
      days.add(addDaysToDateKey(monday, offset));
    }
  }
  return [...days].sort();
}

/**
 * Which calendar days a sync should write and remove. Hand-set days always win, and
 * seeded holidays keep their own name. A feed with no finals changes nothing, so a
 * broken or not-yet-published feed can never put shows back into a finals week.
 */
export function planFinalsSync(input: {
  finalsDates: readonly string[];
  existing: ReadonlyArray<{ date: string; source: string }>;
  /** YYYY-MM-DD. Feed days before it are history and are never removed. */
  today: string;
}): { upsert: string[]; remove: string[] } {
  const desired = finalsWeekDays(input.finalsDates).filter((date) => !isSeededHoliday(date));
  if (desired.length === 0) {
    return { upsert: [], remove: [] };
  }

  const wanted = new Set(desired);
  const sourceByDate = new Map(input.existing.map((row) => [row.date, row.source]));
  return {
    upsert: desired.filter((date) => (sourceByDate.get(date) ?? FINALS_FEED_SOURCE) === FINALS_FEED_SOURCE),
    remove: input.existing
      .filter((row) => row.source === FINALS_FEED_SOURCE && row.date >= input.today && !wanted.has(row.date))
      .map((row) => row.date)
      .sort()
  };
}
