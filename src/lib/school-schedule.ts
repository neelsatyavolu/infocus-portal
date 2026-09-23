/**
 * InFocus 2026–27 class / show schedule.
 *
 * - Monday: PA announcements (short period) — 10 participation pts
 * - Tuesday + Thursday: class meetings — 20 participation pts each
 * - Wednesday + Friday: show days (broadcast) from FIRST_SHOW_DATE. Not class meetings.
 * - Holidays / staff days: nothing (0 pts, not gradeable)
 * - Days before FIRST_PARTICIPATION_DATE are not gradeable (0 pts)
 *
 * Show days stay on the master calendar / teleprompter. Participation is
 * scored on class days, not on air days.
 *
 * Days may be switched around holidays via ScheduleOverride rows (or the
 * overrideKind argument on participationPointsForDate).
 */

/** First day participation can be graded in 2026–27. Earlier class days stay on the calendar. */
export const FIRST_PARTICIPATION_DATE = "2026-08-18";

/** First broadcast show of 2026–27. Earlier Wed/Fri stay class days, not air dates. */
export const FIRST_SHOW_DATE = "2026-09-04";

export const PARTICIPATION_POINTS_PA = 10;
export const PARTICIPATION_POINTS_CLASS = 20;
/** @deprecated Show days are not scored. Use PARTICIPATION_POINTS_CLASS. */
export const PARTICIPATION_POINTS_SHOW = PARTICIPATION_POINTS_CLASS;
export const PARTICIPATION_POINTS_PER_WEEK = 50;

/** @deprecated Use PARTICIPATION_POINTS_PA */
export const PARTICIPATION_POINTS_MONDAY = PARTICIPATION_POINTS_PA;
/** @deprecated Use PARTICIPATION_POINTS_CLASS */
export const PARTICIPATION_POINTS_BLOCK_DAY = PARTICIPATION_POINTS_CLASS;

export type ScheduleKind = "PA" | "SHOW" | "NONE" | "HOLIDAY";

export type SchoolCalendarEntry = {
  date: string; // YYYY-MM-DD (UTC)
  kind: ScheduleKind;
  label: string;
  source: "seed" | "manual";
};

/** UTC weekday: 0=Sun … 6=Sat */
export function defaultScheduleKind(utcDay: number): ScheduleKind {
  if (utcDay === 1) return "PA";
  if (utcDay === 3 || utcDay === 5) return "SHOW";
  return "NONE";
}

function defaultKindForDateKey(dateKey: string): ScheduleKind {
  const kind = defaultScheduleKind(utcWeekdayFromDateKey(dateKey));
  if (kind === "SHOW" && dateKey < FIRST_SHOW_DATE) {
    return "NONE";
  }
  return kind;
}

export function pointsForScheduleKind(kind: ScheduleKind): number {
  if (kind === "PA") return PARTICIPATION_POINTS_PA;
  return 0;
}

/** Tuesday / Thursday class meetings. */
export function isParticipationClassWeekday(utcDay: number) {
  return utcDay === 2 || utcDay === 4;
}

export function isShowDay(kind: ScheduleKind) {
  return kind === "SHOW";
}

export function isPaDay(kind: ScheduleKind) {
  return kind === "PA";
}

export function toUtcDateKey(date: Date): string {
  // Participation dates are stored as UTC midnight — always use UTC parts.
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function utcWeekdayFromDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function holidayLabelForDateKey(dateKey: string): string | null {
  return PAUSD_NO_SCHOOL_2026_27.find((entry) => entry.date === dateKey)?.label ?? null;
}

export type ResolvedScheduleDay = {
  date: string;
  kind: ScheduleKind;
  label: string;
};

/**
 * Resolve kind/label from a YYYY-MM-DD key (timezone-safe).
 * DB overrides win; otherwise seeded holidays; otherwise weekday defaults.
 */
export function resolveScheduleDay(
  dateKey: string,
  overrides?: ReadonlyMap<string, { kind: ScheduleKind; label?: string }> | null
): ResolvedScheduleDay {
  const override = overrides?.get(dateKey);
  if (override) {
    return {
      date: dateKey,
      kind: override.kind,
      label: override.label?.trim() || holidayLabelForDateKey(dateKey) || ""
    };
  }

  if (isSeededHoliday(dateKey)) {
    return {
      date: dateKey,
      kind: "HOLIDAY",
      label: holidayLabelForDateKey(dateKey) ?? "No School"
    };
  }

  return {
    date: dateKey,
    kind: defaultKindForDateKey(dateKey),
    label: ""
  };
}

/**
 * PAUSD 2026–27 no-school / staff days that cancel InFocus activity.
 * Source: PAUSD School Year Calendar 2026–27
 * (https://resources.finalsite.net/.../SchoolYearCalendar2026-27.pdf)
 * and Paly campus calendar. Admin can add more via SchoolCalendarDay.
 */
export const PAUSD_NO_SCHOOL_2026_27: ReadonlyArray<{ date: string; label: string }> = [
  // Pre-term staff (not student class days; included for calendar completeness)
  { date: "2026-08-10", label: "District Day" },
  { date: "2026-08-11", label: "Staff Development Day (9–12)" },
  { date: "2026-08-12", label: "Teacher Work Day" },

  { date: "2026-09-07", label: "Labor Day" },
  { date: "2026-10-02", label: "Staff Development Day" },
  { date: "2026-11-11", label: "Veterans Day" },

  // Thanksgiving break
  { date: "2026-11-23", label: "Thanksgiving Break" },
  { date: "2026-11-24", label: "Thanksgiving Break" },
  { date: "2026-11-25", label: "Thanksgiving Break" },
  { date: "2026-11-26", label: "Thanksgiving / Federal Holiday" },
  { date: "2026-11-27", label: "Thanksgiving Break" },

  // Winter break Dec 21 – Jan 4
  { date: "2026-12-21", label: "Winter Break" },
  { date: "2026-12-22", label: "Winter Break" },
  { date: "2026-12-23", label: "Winter Break" },
  { date: "2026-12-24", label: "Winter Break" },
  { date: "2026-12-25", label: "Winter Break / Christmas" },
  { date: "2026-12-26", label: "Winter Break" },
  { date: "2026-12-27", label: "Winter Break" },
  { date: "2026-12-28", label: "Winter Break" },
  { date: "2026-12-29", label: "Winter Break" },
  { date: "2026-12-30", label: "Winter Break" },
  { date: "2026-12-31", label: "Winter Break" },
  { date: "2027-01-01", label: "Winter Break / New Year's Day" },
  { date: "2027-01-02", label: "Winter Break" },
  { date: "2027-01-03", label: "Winter Break" },
  { date: "2027-01-04", label: "Teacher Work Day / Winter Break end" },

  { date: "2027-01-18", label: "Martin Luther King Jr. Day" },
  { date: "2027-02-12", label: "Local Holiday" },
  { date: "2027-02-15", label: "Presidents Day / Local Holiday" },
  { date: "2027-03-15", label: "Local Holiday" },
  { date: "2027-03-16", label: "Staff Development Day" },

  // Spring break
  { date: "2027-04-05", label: "Spring Break" },
  { date: "2027-04-06", label: "Spring Break" },
  { date: "2027-04-07", label: "Spring Break" },
  { date: "2027-04-08", label: "Spring Break" },
  { date: "2027-04-09", label: "Spring Break" },

  { date: "2027-05-31", label: "Memorial Day" }
];

const SEEDED_HOLIDAY_KEYS = new Set(PAUSD_NO_SCHOOL_2026_27.map((entry) => entry.date));

export function isSeededHoliday(dateKey: string) {
  return SEEDED_HOLIDAY_KEYS.has(dateKey);
}

/**
 * Resolve the schedule kind for a UTC date.
 * `overrides` maps YYYY-MM-DD → ScheduleKind (from DB).
 */
export function scheduleKindForDate(
  date: Date,
  overrides?: ReadonlyMap<string, ScheduleKind> | null
): ScheduleKind {
  const key = toUtcDateKey(date);
  const override = overrides?.get(key);
  if (override) {
    return override;
  }

  if (isSeededHoliday(key)) {
    return "HOLIDAY";
  }

  return defaultKindForDateKey(key);
}

export function isParticipationGradeable(dateKey: string) {
  return dateKey >= FIRST_PARTICIPATION_DATE;
}

/**
 * Participation points possible for a given date.
 * Holidays, non-class days (Wed/Fri shows by default), and days before
 * FIRST_PARTICIPATION_DATE return 0.
 */
export function participationPointsForDate(
  date: Date,
  overrides?: ReadonlyMap<string, ScheduleKind> | null
) {
  if (!isParticipationGradeable(toUtcDateKey(date))) {
    return 0;
  }
  const kind = scheduleKindForDate(date, overrides);
  if (kind === "HOLIDAY") {
    return 0;
  }
  if (kind === "PA") {
    return PARTICIPATION_POINTS_PA;
  }
  if (isParticipationClassWeekday(date.getUTCDay())) {
    return PARTICIPATION_POINTS_CLASS;
  }
  return 0;
}

/** Mon–Fri max for a week starting at UTC Monday midnight. Holidays / pre-term days count as 0. */
export function participationPointsForWeek(
  weekStart: Date,
  overrides?: ReadonlyMap<string, ScheduleKind> | null
) {
  let total = 0;
  for (let offset = 0; offset < 5; offset += 1) {
    const date = new Date(weekStart.getTime() + offset * 24 * 60 * 60 * 1000);
    total += participationPointsForDate(date, overrides);
  }
  return total;
}

export function sumParticipationMax(days: ReadonlyArray<{ maxPoints: number }>) {
  return days.reduce((total, day) => total + day.maxPoints, 0);
}

export function seededCalendarEntries(): SchoolCalendarEntry[] {
  return PAUSD_NO_SCHOOL_2026_27.map((entry) => ({
    date: entry.date,
    kind: "HOLIDAY" as const,
    label: entry.label,
    source: "seed" as const
  }));
}
