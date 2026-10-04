/** Pacific-time helpers for the Meetings tab (all producers meet on Pacific time). */

export const MEETING_TIME_ZONE = "America/Los_Angeles";
/** Fallback only: the Portal sends `joinOpensAt` on every meeting (5 minutes before the start). */
export const JOIN_OPENS_BEFORE_MS = 5 * 60 * 1000;

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: MEETING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});
const dayLabelFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: MEETING_TIME_ZONE,
  weekday: "long",
  month: "short",
  day: "numeric"
});
const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: MEETING_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit"
});
const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: MEETING_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

/** "2026-10-05" in Pacific time. */
export function pacificDayKey(iso: string | Date) {
  return dayKeyFormat.format(new Date(iso));
}

/** "Monday, Oct 5" in Pacific time. */
export function pacificDayLabel(iso: string | Date) {
  return dayLabelFormat.format(new Date(iso));
}

/** "9:15 PM" in Pacific time. */
export function pacificTimeLabel(iso: string | Date) {
  return timeFormat.format(new Date(iso));
}

export function groupByPacificDay<T extends { startsAt: string }>(items: readonly T[]) {
  const groups: Array<{ key: string; label: string; items: T[] }> = [];
  for (const item of [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const key = pacificDayKey(item.startsAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      groups[groups.length - 1] = { ...last, items: [...last.items, item] };
    } else {
      groups.push({ key, label: pacificDayLabel(item.startsAt), items: [item] });
    }
  }
  return groups;
}

function pacificOffsetMs(at: Date) {
  const parts = Object.fromEntries(partsFormat.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** "2026-10-05T21:15" (Pacific wall time, as a datetime-local input gives it) → ISO UTC, or null. */
export function pacificWallTimeToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle the offset across DST changes.
  let guess = wallAsUtc - pacificOffsetMs(new Date(wallAsUtc));
  guess = wallAsUtc - pacificOffsetMs(new Date(guess));
  return new Date(guess).toISOString();
}

/** ISO → "2026-10-05T21:15" Pacific wall time for a datetime-local input. */
export function isoToPacificWallTime(iso: string) {
  const parts = Object.fromEntries(partsFormat.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

type JoinWindow = { startsAt: string; status?: string; joinOpensAt?: string | null };

/** When Join opens (epoch ms): the server's `joinOpensAt`, else 5 minutes before the start. */
export function joinOpensAtMs(meeting: JoinWindow) {
  const server = meeting.joinOpensAt ? new Date(meeting.joinOpensAt).getTime() : Number.NaN;
  return Number.isFinite(server) ? server : new Date(meeting.startsAt).getTime() - JOIN_OPENS_BEFORE_MS;
}

/** A live meeting is always open; otherwise Join opens at `joinOpensAt`. */
export function canJoinNow(meeting: JoinWindow, now = Date.now()) {
  return meeting.status === "LIVE" || now >= joinOpensAtMs(meeting);
}

/** "4:05" until the join window opens, for the countdown. */
export function formatCountdown(ms: number) {
  return formatElapsed(Math.ceil(Math.max(0, ms) / 1000) * 1000);
}

/** "1:02:09" / "4:05" for the call timer. */
export function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
