/**
 * Cycle deadlines are calendar days (stored as midnight UTC). A deadline closes
 * at 11:59 PM Pacific on that day, not at midnight UTC.
 */
const DEADLINE_TIME_ZONE = "America/Los_Angeles";
const HOUR_MS = 60 * 60 * 1000;

/** One-off Final Cut closes, keyed by the stored due date (YYYY-MM-DD). */
export const FINAL_CUT_CLOSE_OVERRIDES: Record<string, string> = {
  // 2026-27 cycle 1: students were moved to cycle 2 early, so Final Cut stays open until 2 AM PDT Sep 30.
  "2026-09-29": "2026-09-30T09:00:00.000Z"
};

const pacificDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: DEADLINE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const pacificHourFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: DEADLINE_TIME_ZONE,
  hour: "numeric",
  hourCycle: "h23"
});

export function pacificDateKey(at: Date) {
  return pacificDateFormat.format(at);
}

function dateKeyOf(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Time past midnight UTC: zero for stored days, the leftover hours of a fractional extension otherwise. */
function extensionOffsetMs(date: Date) {
  return date.getTime() - Date.parse(`${dateKeyOf(date)}T00:00:00.000Z`);
}

/** 11:59:59.999 PM Pacific on a stored deadline day, plus any fractional-extension offset. */
export function deadlineClosesAt(date: Date) {
  const [year, month, day] = dateKeyOf(date).split("-").map(Number);
  // Midnight PST the next day; PDT midnight is one hour earlier.
  const nextMidnightPst = Date.UTC(year!, month! - 1, day! + 1, 8);
  const nextMidnight = nextMidnightPst - Number(pacificHourFormat.format(nextMidnightPst)) * HOUR_MS;
  return new Date(nextMidnight - 1 + extensionOffsetMs(date));
}

export function finalCutClosesAt(date: Date) {
  const override = FINAL_CUT_CLOSE_OVERRIDES[dateKeyOf(date)];
  return override ? new Date(Date.parse(override) + extensionOffsetMs(date)) : deadlineClosesAt(date);
}

export function deadlinePassed(
  date: Date | null | undefined,
  now: Date,
  closesAt: (date: Date) => Date = deadlineClosesAt
) {
  return Boolean(date && now.getTime() > closesAt(date).getTime());
}

export function finalCutDeadlinePassed(date: Date | null | undefined, now: Date) {
  return deadlinePassed(date, now, finalCutClosesAt);
}

/** Pacific day a Final Cut upload counts as turned in; uploads before the close count on the due date. */
export function finalCutTurnInDateKey(uploadedAt: Date, finalCutDate: Date | null) {
  const key = pacificDateKey(uploadedAt);
  if (!finalCutDate) return key;
  const dueKey = dateKeyOf(finalCutDate);
  return key > dueKey && uploadedAt.getTime() <= finalCutClosesAt(finalCutDate).getTime() ? dueKey : key;
}
