import { pacificDateKey } from "@/src/lib/deadlines";
import type { SchoolYear } from "@/src/lib/program-config";

/**
 * The semester's last turn-in day (Admin → School years) when turn-in is closed at `now`, else null.
 * A day closes at 11:59:59 PM Pacific. First semester reopens on the S2 first show (or stays
 * closed to the end of the year when there is none); second semester stays closed to the last day.
 */
export function workTurnInClosedAfter(years: readonly SchoolYear[], now: Date): string | null {
  const today = pacificDateKey(now);
  const year = years.find((entry) => entry.firstDay <= today && today <= entry.lastDay);
  if (!year) return null;

  const firstCutoff = year.firstSemesterLastWorkDay;
  const secondStart = year.secondSemesterFirstShowDate;
  if (firstCutoff && today > firstCutoff && (!secondStart || today < secondStart)) {
    return firstCutoff;
  }

  const secondCutoff = year.secondSemesterLastWorkDay;
  if (secondCutoff && today > secondCutoff) {
    return secondCutoff;
  }
  return null;
}

/** "Saturday, December 13" for a YYYY-MM-DD key. */
export function formatTurnInDay(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

export function workTurnInClosedMessage(dateKey: string) {
  return `Turn-in closed for the semester after ${formatTurnInDay(dateKey)} at 11:59 PM Pacific.`;
}
