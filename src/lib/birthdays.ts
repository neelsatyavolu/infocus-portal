/**
 * Birthdays on the Master Calendar. People enter a month and day in Settings → Profile (no year
 * is stored). A birthday on a weekend or a day off moves back to the nearest earlier class day,
 * so it is celebrated while everyone is in class.
 */
import { addDaysToDateKey } from "@/src/lib/show-assignment";

export type BirthdayPerson = { name: string; month: number; day: number };

/** One name on a calendar day. `actualDate` is the real birthday when it moved to an earlier day. */
export type CalendarBirthday = { name: string; actualDate: string | null };

/** Days in each month, with February's 29th allowed. */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Furthest a birthday moves back looking for a class day (longer than winter break). */
export const BIRTHDAY_LOOKBACK_DAYS = 31;

/** Days a birthday month can have (February allows the 29th); 31 when no month is picked. */
export function daysInBirthdayMonth(month: number | null) {
  return month && month >= 1 && month <= 12 ? DAYS_IN_MONTH[month - 1] : 31;
}

export function isValidBirthday(month: number, day: number) {
  return (
    Number.isInteger(month) && Number.isInteger(day) && month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1]
  );
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The birthday's date in `year`; February 29 falls on February 28 outside leap years. */
function birthdayDateKey(year: number, month: number, day: number) {
  const safeDay = month === 2 && day === 29 && !isLeapYear(year) ? 28 : day;
  return `${year}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

/** The nearest class day on or before `dateKey`, or null when none is within the lookback. */
function celebrationDateKey(dateKey: string, isClassDay: (dateKey: string) => boolean) {
  for (let back = 0; back <= BIRTHDAY_LOOKBACK_DAYS; back += 1) {
    const candidate = addDaysToDateKey(dateKey, -back);
    if (isClassDay(candidate)) return candidate;
  }
  return null;
}

/**
 * Birthdays celebrated on days in [startKey, endKey), keyed by date and sorted by name. A
 * birthday early next month (or next year) can land in this month after moving back.
 */
export function placeBirthdays({
  people,
  startKey,
  endKey,
  isClassDay
}: {
  people: BirthdayPerson[];
  startKey: string;
  endKey: string;
  isClassDay: (dateKey: string) => boolean;
}): Record<string, CalendarBirthday[]> {
  const startYear = Number(startKey.slice(0, 4));
  const latestActual = addDaysToDateKey(endKey, BIRTHDAY_LOOKBACK_DAYS);
  const placed: Record<string, CalendarBirthday[]> = {};

  for (const person of people) {
    if (!isValidBirthday(person.month, person.day)) continue;
    // Birthdays only move earlier, so only this year's and next year's can land in the range.
    for (const year of [startYear, startYear + 1]) {
      const actual = birthdayDateKey(year, person.month, person.day);
      if (actual < startKey || actual >= latestActual) continue;
      const day = celebrationDateKey(actual, isClassDay);
      if (!day || day < startKey || day >= endKey) continue;
      placed[day] = [...(placed[day] ?? []), { name: person.name, actualDate: day === actual ? null : actual }];
    }
  }

  return Object.fromEntries(
    Object.entries(placed).map(([day, list]) => [day, [...list].sort((a, b) => a.name.localeCompare(b.name))])
  );
}

/** "Abby", or "Otto (Sun, Nov 8)" when the birthday moved to an earlier day. */
export function birthdayLabel(birthday: CalendarBirthday) {
  if (!birthday.actualDate) return birthday.name;
  const date = new Date(`${birthday.actualDate}T00:00:00.000Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric"
  });
  return `${birthday.name} (${date})`;
}
