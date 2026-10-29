/** Pure date, key and draft helpers for the Participation page (no React), so they can be tested. */

export const NOTE_MAX = 600;
/** Used only when a date's max is missing from a loaded week (never to decide graded vs off). */
export const MAX_FALLBACK = 20;

/**
 * Fired after this page saves scores or approves/denies a request, so navigation badges that
 * count pending participation can refresh (mirrors EXTENSION_REQUESTS_CHANGED_EVENT).
 */
export const PARTICIPATION_REQUESTS_CHANGED_EVENT = "infocus-participation-requests-changed";

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type Person = { id: string; name: string | null; email: string | null };

export type Student = Person & { nickname?: string | null };

export type Entry = { userId: string; date: string; points: number; notes: string };

export type DayLimit = { date: string; maxPoints: number };

export type PendingItem = {
  requestId: string;
  userId: string;
  date: string;
  points: number;
  notes: string;
  requestedBy: Person;
};

export type QueueItem = {
  userId: string;
  studentName: string | null;
  studentEmail: string | null;
  date: string;
  points: number;
  notes: string;
  currentPoints: number | null;
  currentNotes: string;
};

export type QueueRequest = {
  id: string;
  createdAt: string;
  requestedBy: Person;
  canReview: boolean;
  items: QueueItem[];
};

export type WeekData = {
  weekStart?: string | null;
  currentUserId?: string;
  students: Student[];
  entries: Entry[];
  maxPointsByDate: DayLimit[];
  pendingCount: number;
  pendingItems: PendingItem[];
};

/** Scores and comments by entryKey(userId, date). */
export type GridCells = { points: Record<string, number>; notes: Record<string, string> };

export type DayColumn = {
  date: Date;
  dateKey: string;
  /** null when the loaded week has no max for this date. */
  max: number | null;
  graded: boolean;
  isToday: boolean;
};

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Monday-anchored week start for a given date. */
export function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Mon–Fri of the week (weekends carry no participation points). */
export function weekClassDays(weekStart: Date) {
  return Array.from({ length: 5 }, (_, offset) => addDays(weekStart, offset));
}

export function formatWeekLabel(weekStart: Date) {
  const format = (value: Date) => value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${format(weekStart)} – ${format(addDays(weekStart, 4))}`;
}

export function formatShortDate(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function entryKey(userId: string, date: string) {
  return `${userId}:${date}`;
}

export function personLabel(person: { name: string | null; email: string | null }) {
  return person.name ?? person.email ?? "Unknown";
}

export function formatDayKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

/** Live scores, then this week's pending docks on top (pending values show in the grid). */
export function baselineFromWeek(week: WeekData): GridCells {
  const points: Record<string, number> = {};
  const notes: Record<string, string> = {};
  for (const entry of week.entries) {
    points[entryKey(entry.userId, entry.date)] = entry.points;
    notes[entryKey(entry.userId, entry.date)] = entry.notes;
  }
  for (const item of week.pendingItems ?? []) {
    points[entryKey(item.userId, item.date)] = item.points;
    notes[entryKey(item.userId, item.date)] = item.notes;
  }
  return { points, notes };
}

/**
 * Applies a fresh server copy without losing work: every cell whose draft differs from
 * `reference` (what the drafts were based on) keeps the draft; every other cell takes the server.
 */
export function rebaseCells(server: GridCells, current: GridCells, reference: GridCells): GridCells {
  const points = { ...server.points };
  for (const [key, value] of Object.entries(current.points)) {
    if (value !== reference.points[key]) points[key] = value;
  }
  const notes = { ...server.notes };
  for (const [key, value] of Object.entries(current.notes)) {
    if (value !== (reference.notes[key] ?? "")) notes[key] = value;
  }
  return { points, notes };
}

/** A comment as the save payload sends it. */
export function normalizeNote(note: string | undefined) {
  return (note ?? "").trim().slice(0, NOTE_MAX);
}

/** True when this cell's draft differs from the loaded copy (same trim and slice as Save). */
export function cellChanged(drafts: GridCells, baseline: GridCells, key: string) {
  return (
    drafts.points[key] !== baseline.points[key] || normalizeNote(drafts.notes[key]) !== normalizeNote(baseline.notes[key])
  );
}

/**
 * Unsaved cells (score or comment differs from the loaded copy) and comments typed on a cell
 * with no score — Save only sends cells that have a score, so those comments won't be kept.
 */
export function countChanges(drafts: GridCells, baseline: GridCells) {
  let unsaved = 0;
  let orphanNotes = 0;
  const keys = new Set([...Object.keys(drafts.points), ...Object.keys(drafts.notes)]);
  for (const key of keys) {
    if (drafts.points[key] === undefined) {
      if (normalizeNote(drafts.notes[key])) orphanNotes += 1;
      continue;
    }
    if (cellChanged(drafts, baseline, key)) unsaved += 1;
  }
  return { unsaved, orphanNotes };
}

/** Every scored cell, as POST /api/participation expects it (the server diffs against live rows). */
export function buildSavePayload(drafts: GridCells) {
  return Object.entries(drafts.points).map(([key, points]) => {
    const [userId, date] = key.split(":");
    return { userId, date, points, notes: normalizeNote(drafts.notes[key]) };
  });
}

/**
 * "Full week" for one student: every class day gets its max. An off day (max 0) is only zeroed
 * when it already holds a score (a stray score is cleared, as before); an empty one stays empty,
 * so the button never adds unsaved changes that no column shows. With `fillOffDays` (the off-day
 * columns are on screen) every off day gets its 0 too, as the old grid did.
 */
export function fullWeekPoints(
  points: Record<string, number>,
  userId: string,
  weekStart: Date,
  maxFor: (dateKey: string) => number,
  fillOffDays = false
): Record<string, number> {
  const filled = weekClassDays(weekStart).flatMap((day) => {
    const dateKey = toDateKey(day);
    const key = entryKey(userId, dateKey);
    const max = maxFor(dateKey);
    return max === 0 && points[key] === undefined && !fillOffDays ? [] : [[key, max] as const];
  });
  return { ...points, ...Object.fromEntries(filled) };
}

export function clampPoints(raw: string, max: number) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(max, Math.round(parsed))) : 0;
}

export function dayColumns(weekStart: Date, limits: DayLimit[], todayKey: string): DayColumn[] {
  const maxByDate = new Map(limits.map((limit) => [limit.date, limit.maxPoints]));
  return weekClassDays(weekStart).map((date) => {
    const dateKey = toDateKey(date);
    const max = maxByDate.get(dateKey);
    return {
      date,
      dateKey,
      max: max ?? null,
      graded: max !== undefined && max > 0,
      isToday: dateKey === todayKey
    };
  });
}

/**
 * An off day (max 0: Wed/Fri shows, holidays) only gets a column when someone has a real score
 * or a comment there — e.g. a score saved before a holiday was added. A 0 on a 0-point day
 * (what an older "Full week" saved) means nothing, so it doesn't count. The page checks the
 * drafts and the loaded copy, so a stray score that was just zeroed keeps its column.
 */
export function offDayHasData(dateKey: string, studentIds: string[], drafts: GridCells) {
  return studentIds.some((id) => {
    const key = entryKey(id, dateKey);
    return (drafts.points[key] ?? 0) > 0 || normalizeNote(drafts.notes[key]).length > 0;
  });
}

/**
 * True when an off day's column has to stay on screen even with "Show off days" off: someone has
 * a real score or comment there (drafts or loaded copy), or a cell that day isn't saved yet — so
 * no unsaved change is ever hidden.
 */
export function offDayInUse(dateKey: string, studentIds: string[], drafts: GridCells, baseline: GridCells) {
  return (
    offDayHasData(dateKey, studentIds, drafts) ||
    offDayHasData(dateKey, studentIds, baseline) ||
    studentIds.some((id) => cellChanged(drafts, baseline, entryKey(id, dateKey)))
  );
}

/**
 * The day the phone view opens on: in the current week, the latest graded day on or before
 * today (Wed → Tue, Fri → Thu: grade the class that just happened); otherwise the first one.
 */
export function defaultPhoneDay(days: DayColumn[], todayKey: string, isCurrentWeek: boolean): string | null {
  const graded = days.filter((day) => day.graded);
  if (graded.length === 0) return days[0]?.dateKey ?? null;
  if (isCurrentWeek) {
    const past = graded.filter((day) => day.dateKey <= todayKey);
    if (past.length > 0) return past[past.length - 1].dateKey;
  }
  return graded[0].dateKey;
}
