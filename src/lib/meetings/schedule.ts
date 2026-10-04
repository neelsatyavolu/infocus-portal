/**
 * Default recurring producer meeting: Sunday, Monday and Wednesday at 9:15 PM Pacific, 60 minutes.
 * Pure date math (Intl only), DST-correct: each slot is 21:15 Pacific wall time on its own date.
 */

export const MEETINGS_TIME_ZONE = "America/Los_Angeles";
export const UPCOMING_WINDOW_DAYS = 21;

export const PRODUCER_SERIES = {
  seriesKey: "producers",
  title: "InFocus Producer Meeting",
  /** 0 = Sunday … 6 = Saturday */
  weekdays: [0, 1, 3] as readonly number[],
  hour: 21,
  minute: 15,
  durationMinutes: 60
} as const;

/** Scheduled meetings open this long before they start (everyone, hosts included). */
export const JOIN_OPENS_BEFORE_MS = 5 * 60 * 1000;

export function meetingJoinOpensAt(startsAt: Date) {
  return new Date(startsAt.getTime() - JOIN_OPENS_BEFORE_MS);
}

/** "9:10 PM" when it's today (Pacific), else "Sunday, October 4 at 9:10 PM". */
export function pacificOpensLabel(instant: Date, now: Date) {
  const time = new Intl.DateTimeFormat("en-US", { timeZone: MEETINGS_TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(instant);
  if (pacificDateKey(instant) === pacificDateKey(now)) return time;
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: MEETINGS_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(instant);
  return `${day} at ${time}`;
}

export type SeriesOccurrence = { occurrenceKey: string; startsAt: Date };

const DAY_MS = 24 * 60 * 60 * 1000;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: MEETINGS_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

function pacificParts(instant: Date) {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(instant).map((part) => [part.type, part.value])
  ) as Record<string, string>;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

/** Pacific offset from UTC at `instant`, in ms (negative: −7h or −8h). */
function pacificOffsetMs(instant: Date) {
  const p = pacificParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** "YYYY-MM-DD" of `instant` on the Pacific calendar. */
export function pacificDateKey(instant: Date) {
  const p = pacificParts(instant);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Pacific wall time of `instant` as an iCalendar local stamp, "YYYYMMDDTHHMMSS". */
export function pacificLocalStamp(instant: Date) {
  const p = pacificParts(instant);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${p.year}${pad(p.month)}${pad(p.day)}T${pad(p.hour)}${pad(p.minute)}${pad(p.second)}`;
}

/** Original start of a default-series slot (its occurrenceKey at 21:15 Pacific), even after it moved. */
export function producerSlotStart(occurrenceKey: string) {
  return pacificWallTimeToUtc(occurrenceKey, PRODUCER_SERIES.hour, PRODUCER_SERIES.minute);
}

/** The UTC instant of `hour:minute` Pacific wall time on Pacific date `dateKey` ("YYYY-MM-DD"). */
export function pacificWallTimeToUtc(dateKey: string, hour: number, minute: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const first = wall - pacificOffsetMs(new Date(wall));
  // Re-check at the candidate: near a DST change the first guess can be an hour off.
  const second = wall - pacificOffsetMs(new Date(first));
  return new Date(second);
}

function addDaysToKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

function weekdayOfKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
}

/**
 * Slots of the default producer series that have not ended yet and start within the next
 * `windowDays` days. `occurrenceKey` is the slot's Pacific date and never changes when moved.
 */
export function producerOccurrences(now: Date, windowDays = UPCOMING_WINDOW_DAYS): SeriesOccurrence[] {
  const series = PRODUCER_SERIES;
  const today = pacificDateKey(now);
  const horizon = now.getTime() + windowDays * DAY_MS;
  const durationMs = series.durationMinutes * 60 * 1000;
  const slots: SeriesOccurrence[] = [];

  for (let offset = 0; offset <= windowDays; offset += 1) {
    const occurrenceKey = addDaysToKey(today, offset);
    if (!series.weekdays.includes(weekdayOfKey(occurrenceKey))) continue;
    const startsAt = pacificWallTimeToUtc(occurrenceKey, series.hour, series.minute);
    if (startsAt.getTime() + durationMs <= now.getTime()) continue;
    if (startsAt.getTime() > horizon) continue;
    slots.push({ occurrenceKey, startsAt });
  }
  return slots;
}
