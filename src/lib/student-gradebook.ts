import {
  FIRST_PARTICIPATION_DATE,
  participationPointsForDate,
  resolveScheduleDay,
  toUtcDateKey,
  type ScheduleKind
} from "@/src/lib/school-schedule";

export type GradebookDay = {
  date: string;
  weekday: string;
  kind: ScheduleKind;
  label: string;
  /** Null when the day has no participation entry yet. */
  points: number | null;
  maxPoints: number;
  notes: string;
};

export type GradebookWeek = {
  weekStart: string;
  label: string;
  /** Sum of entered points. */
  earned: number;
  /** Sum of max points on days that have an entry. */
  possible: number;
  /** Sum of max points on every class day in the week. */
  fullPossible: number;
  graded: boolean;
  days: GradebookDay[];
};

export type GradebookCheckIn = {
  cycleNumber: number;
  pitching: boolean;
  proofOfContact: boolean;
  aRollBRoll: boolean;
  initialCut: boolean;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function utcDateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function utcMondayOf(dateKey: string) {
  const date = utcDateFromKey(dateKey);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

export function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function formatWeekLabel(weekStartKey: string) {
  const start = utcDateFromKey(weekStartKey);
  const end = addUtcDays(start, 4);
  const format = (value: Date) =>
    value.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${format(start)} – ${format(end)}`;
}

export function buildParticipationWeeks(input: {
  semesterStart: Date;
  semesterEnd: Date;
  entries: Array<{ date: Date; points: number; notes?: string }>;
  overrides?: ReadonlyMap<string, ScheduleKind> | null;
}): GradebookWeek[] {
  const semesterStartKey = toUtcDateKey(input.semesterStart);
  const gradeableStartKey =
    semesterStartKey > FIRST_PARTICIPATION_DATE ? semesterStartKey : FIRST_PARTICIPATION_DATE;
  const semesterEndKey = toUtcDateKey(input.semesterEnd);
  const entryByDate = new Map(
    input.entries.map((entry) => [toUtcDateKey(entry.date), entry])
  );
  const overrideMap = new Map(
    [...(input.overrides ?? [])].map(([date, kind]) => [date, { kind }])
  );

  const weeks: GradebookWeek[] = [];
  let cursor = utcMondayOf(gradeableStartKey);
  const last = utcDateFromKey(semesterEndKey);

  while (cursor.getTime() <= last.getTime()) {
    const weekStart = toUtcDateKey(cursor);
    const days: GradebookDay[] = [];

    for (let offset = 0; offset < 5; offset += 1) {
      const date = addUtcDays(cursor, offset);
      const dateKey = toUtcDateKey(date);
      if (dateKey < gradeableStartKey || dateKey > semesterEndKey) {
        continue;
      }

      const resolved = resolveScheduleDay(dateKey, overrideMap);
      const entry = entryByDate.get(dateKey);
      days.push({
        date: dateKey,
        weekday: WEEKDAY_LABELS[date.getUTCDay()] ?? dateKey,
        kind: resolved.kind,
        label: resolved.label,
        points: entry ? entry.points : null,
        maxPoints: participationPointsForDate(date, input.overrides),
        notes: entry?.notes ?? ""
      });
    }

    if (days.length > 0) {
      const entered = days.filter((day) => day.points !== null);
      weeks.push({
        weekStart,
        label: formatWeekLabel(weekStart),
        earned: entered.reduce((total, day) => total + (day.points ?? 0), 0),
        possible: entered.reduce((total, day) => total + day.maxPoints, 0),
        fullPossible: days.reduce((total, day) => total + day.maxPoints, 0),
        graded: entered.length > 0,
        days
      });
    }

    cursor = addUtcDays(cursor, 7);
  }

  return weeks;
}

/** Total-tab participation: a week releases only after Sunday ends in Pacific time. */
export function completedParticipationTotals(
  input: Parameters<typeof buildParticipationWeeks>[0] & { now: Date }
): { earned: number; possible: number } {
  const localDateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(input.now);
  const currentWeekStart = toUtcDateKey(utcMondayOf(localDateKey));
  let earned = 0;
  let possible = 0;
  for (const week of buildParticipationWeeks(input)) {
    if (week.weekStart >= currentWeekStart) continue;
    for (const day of week.days) {
      if (day.maxPoints <= 0 || day.points === null) continue;
      earned += day.points;
      possible += day.maxPoints;
    }
  }
  return { earned, possible };
}
