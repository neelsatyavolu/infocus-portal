import {
  FIRST_SHOW_DATE,
  resolveScheduleDay,
  toUtcDateKey,
  type ScheduleKind
} from "@/src/lib/school-schedule";

export { FIRST_SHOW_DATE };

export const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type ScheduleOverrideMap = ReadonlyMap<string, { kind: ScheduleKind; label?: string }>;

export function isDateKey(value: string): value is string {
  return DATE_KEY_PATTERN.test(value);
}

export function dateKeyFromParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Local calendar date — matches master calendar cells, not UTC. */
export function todayDateKey(now = new Date()) {
  return dateKeyFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function parseDateKeyUtc(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const date = parseDateKeyUtc(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toUtcDateKey(date);
}

/** Monday of the UTC week that contains `dateKey`. */
export function mondayDateKey(dateKey: string) {
  const weekday = parseDateKeyUtc(dateKey).getUTCDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  return addDaysToDateKey(dateKey, -offset);
}

/**
 * PA day in the same week as a show (Mon–Fri). Walks past class, holiday, and
 * earlier show days so Monday PA blocks both Wednesday and Friday.
 */
export function precedingPaDateKey(
  showDateKey: string,
  kindForDate: (dateKey: string) => ScheduleKind
) {
  const weekStart = mondayDateKey(showDateKey);
  for (let offset = 1; ; offset += 1) {
    const dateKey = addDaysToDateKey(showDateKey, -offset);
    if (dateKey < weekStart) {
      return null;
    }
    if (kindForDate(dateKey) === "PA") {
      return dateKey;
    }
  }
}

export function monthKeyFromDateKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

export function formatShowDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

export function formatShowDateShort(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function searchStartDateKey(fromDateKey: string) {
  return fromDateKey < FIRST_SHOW_DATE ? FIRST_SHOW_DATE : fromDateKey;
}

export function nextUpcomingShowDate(
  fromDateKey: string,
  overrides?: ScheduleOverrideMap | null,
  options?: { includeToday?: boolean }
) {
  const startKey = searchStartDateKey(fromDateKey);
  const includeToday = startKey === fromDateKey ? (options?.includeToday ?? true) : true;
  for (let offset = includeToday ? 0 : 1; offset <= 90; offset += 1) {
    const dateKey = addDaysToDateKey(startKey, offset);
    if (resolveScheduleDay(dateKey, overrides).kind === "SHOW") {
      return dateKey;
    }
  }
  return null;
}

export function listUpcomingShowDates(
  fromDateKey: string,
  count = 8,
  overrides?: ScheduleOverrideMap | null
) {
  const startKey = searchStartDateKey(fromDateKey);
  const dates: string[] = [];
  for (let offset = 0; offset <= 120 && dates.length < count; offset += 1) {
    const dateKey = addDaysToDateKey(startKey, offset);
    if (resolveScheduleDay(dateKey, overrides).kind === "SHOW") {
      dates.push(dateKey);
    }
  }
  return dates;
}

/** Every SHOW day from the first air date through `endKey`, inclusive. */
export function listShowDatesThrough(endKey: string, overrides?: ScheduleOverrideMap | null) {
  if (endKey < FIRST_SHOW_DATE) {
    return [];
  }
  const dates: string[] = [];
  for (let dateKey = FIRST_SHOW_DATE; dateKey <= endKey; dateKey = addDaysToDateKey(dateKey, 1)) {
    if (resolveScheduleDay(dateKey, overrides).kind === "SHOW") {
      dates.push(dateKey);
    }
  }
  return dates;
}
