import type { SchoolYear } from "@/src/lib/program-config";
import { defaultScheduleKind, isSeededHoliday, utcWeekdayFromDateKey, type ScheduleKind } from "@/src/lib/school-schedule";
import { addDaysToDateKey } from "@/src/lib/show-assignment";

/** SchoolCalendarDay.source for days generated from the school years. */
export const SCHOOL_YEAR_SOURCE = "config";
export const SUMMER_LABEL = "Summer break";

/** 52 weeks, so a projected date keeps its weekday. */
const YEAR_DAYS = 364;
/** A new year needs at least this many school days in Paly's calendar before the Portal trusts it. */
const MIN_FEED_SCHOOL_DAYS = 20;
/** Shows start about three weeks into the year. */
const FIRST_SHOW_OFFSET_DAYS = 21;

export type GeneratedDay = { date: string; kind: ScheduleKind; label: string };

function projectYear(year: SchoolYear): SchoolYear {
  return {
    firstDay: addDaysToDateKey(year.firstDay, YEAR_DAYS),
    lastDay: addDaysToDateKey(year.lastDay, YEAR_DAYS),
    firstShowDate: addDaysToDateKey(year.firstShowDate, YEAR_DAYS),
    source: "feed"
  };
}

/**
 * The saved years, plus guessed ones (same dates a year later) until the calendar reaches
 * `through`. The guess keeps summers and first-show dates roughly right in a year nobody
 * has set up yet; a year read from Paly's calendar or entered by hand replaces it.
 */
export function schoolYearsThrough(years: readonly SchoolYear[], through: string): SchoolYear[] {
  const all = [...years];
  while (all.length > 0 && all.length < 40 && all[all.length - 1].lastDay < through) {
    all.push(projectYear(all[all.length - 1]));
  }
  return all;
}

function isWeekday(dateKey: string) {
  const weekday = utcWeekdayFromDateKey(dateKey);
  return weekday >= 1 && weekday <= 5;
}

/**
 * Calendar days the school years imply: no shows before a year's first show, and nothing at
 * all (no PA, shows or participation) on summer weekdays between two years.
 */
export function schoolYearDays(years: readonly SchoolYear[]): GeneratedDay[] {
  const days: GeneratedDay[] = [];
  years.forEach((year, index) => {
    for (let date = year.firstDay; date < year.firstShowDate; date = addDaysToDateKey(date, 1)) {
      if (defaultScheduleKind(utcWeekdayFromDateKey(date)) === "SHOW" && !isSeededHoliday(date)) {
        days.push({ date, kind: "NONE", label: "" });
      }
    }
    const next = years[index + 1];
    if (!next) return;
    for (let date = addDaysToDateKey(year.lastDay, 1); date < next.firstDay; date = addDaysToDateKey(date, 1)) {
      if (isWeekday(date) && !isSeededHoliday(date)) {
        days.push({ date, kind: "HOLIDAY", label: SUMMER_LABEL });
      }
    }
  });
  return days;
}

/**
 * A school year Paly's calendar lists that is not saved yet, or null. `schoolDays` are the
 * dates with a bell schedule. The first show is a guess: the first Wednesday or Friday three
 * weeks in. Someone should confirm it in Admin → Configuration.
 */
export function schoolYearFromFeed(schoolDays: readonly string[], years: readonly SchoolYear[]): SchoolYear | null {
  const lastSaved = years.reduce((latest, year) => (year.lastDay > latest ? year.lastDay : latest), "");
  const fresh = schoolDays.filter((date) => date > addDaysToDateKey(lastSaved || "1970-01-01", 30)).sort();
  if (fresh.length < MIN_FEED_SCHOOL_DAYS) return null;

  const firstDay = fresh[0];
  const lastDay = fresh[fresh.length - 1];
  let firstShowDate = addDaysToDateKey(firstDay, FIRST_SHOW_OFFSET_DAYS);
  while (firstShowDate < lastDay && defaultScheduleKind(utcWeekdayFromDateKey(firstShowDate)) !== "SHOW") {
    firstShowDate = addDaysToDateKey(firstShowDate, 1);
  }
  return { firstDay, lastDay, firstShowDate, source: "feed" };
}

/**
 * Which generated days a sync should write and remove. Past days are never rewritten, and
 * a day set by hand or marked as finals from Paly's calendar is left alone.
 */
export function planSchoolYearSync(input: {
  days: readonly GeneratedDay[];
  existing: ReadonlyArray<{ date: string; source: string }>;
  /** YYYY-MM-DD. */
  today: string;
}): { upsert: GeneratedDay[]; remove: string[] } {
  const sourceByDate = new Map(input.existing.map((row) => [row.date, row.source]));
  const upcoming = input.days.filter((day) => day.date >= input.today);
  const wanted = new Set(upcoming.map((day) => day.date));
  return {
    upsert: upcoming.filter((day) => (sourceByDate.get(day.date) ?? SCHOOL_YEAR_SOURCE) === SCHOOL_YEAR_SOURCE),
    remove: input.existing
      .filter((row) => row.source === SCHOOL_YEAR_SOURCE && row.date >= input.today && !wanted.has(row.date))
      .map((row) => row.date)
      .sort()
  };
}
