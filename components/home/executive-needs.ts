import { pacificDateKey } from "@/src/lib/deadlines";

/**
 * Pure helpers for the executive Home's "Needs you" list: the order of the rows and the urgency
 * tag on each. Client-safe (no server imports); src/server/executive-dashboard.ts builds the items.
 */

export type NeedKind =
  | "group"
  | "extensions"
  | "participation"
  | "access"
  | "livestreams"
  | "anchors"
  | "announcers"
  | "queue";

export type NeedItem = {
  key: string;
  kind: NeedKind;
  title: string;
  /** What is needed, in a few words ("Stage 3 sign-off", "3 waiting on you"). */
  need: string;
  href: string;
  /** When the work is due (ISO). Null when nothing is due. */
  dueAt: string | null;
  /** When it became ready for the viewer (ISO): the oldest one for counted kinds. */
  waitingSince: string | null;
};

export type NeedUrgency = { label: string; tone: "danger" | "warning" | "neutral"; basis: "due" | "waiting" };

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function time(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Whole Pacific calendar days from `from` to `to` (negative when `to` is earlier). */
function pacificDayDiff(from: Date, to: Date) {
  const fromKey = Date.parse(`${pacificDateKey(from)}T00:00:00.000Z`);
  const toKey = Date.parse(`${pacificDateKey(to)}T00:00:00.000Z`);
  return Math.round((toKey - fromKey) / DAY_MS);
}

function urgencyRank(item: NeedItem, now: number) {
  const due = time(item.dueAt);
  if (due !== null) return due <= now ? 0 : 1;
  return 2;
}

function compareNullableAsc(a: number | null, b: number | null) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * Overdue first (the oldest deadline at the top), then due soonest, then everything without a
 * deadline by how long it has waited (longest first). Ties go to whatever waited longer, then
 * the title. Returns a new array.
 */
export function orderNeeds(items: readonly NeedItem[], now: Date = new Date()): NeedItem[] {
  const nowMs = now.getTime();
  return [...items].sort((a, b) => {
    const rank = urgencyRank(a, nowMs) - urgencyRank(b, nowMs);
    if (rank !== 0) return rank;
    const due = compareNullableAsc(time(a.dueAt), time(b.dueAt));
    if (due !== 0) return due;
    const waiting = compareNullableAsc(time(a.waitingSince), time(b.waitingSince));
    if (waiting !== 0) return waiting;
    return a.title.localeCompare(b.title);
  });
}

function dueLabel(dueAt: Date, now: Date) {
  const days = pacificDayDiff(now, dueAt);
  if (days <= 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 7) {
    return `Due ${dueAt.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/Los_Angeles" })}`;
  }
  return `Due ${dueAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" })}`;
}

/** "5h" under a day, then whole days. */
export function waitingAge(since: Date, now: Date) {
  const ms = Math.max(0, now.getTime() - since.getTime());
  if (ms < DAY_MS) return `${Math.max(1, Math.floor(ms / HOUR_MS))}h`;
  return `${Math.floor(ms / DAY_MS)}d`;
}

/**
 * The row's tag: "Overdue 2d" (danger), "Due today" / "Due tomorrow" / "Due Thu" (warning within
 * a week; "Due Oct 22" after that is neutral), or "Waiting 3d" (neutral) when nothing is due.
 * Null when the item has neither date.
 */
export function needUrgency(item: NeedItem, now: Date = new Date()): NeedUrgency | null {
  const due = time(item.dueAt);
  if (due !== null) {
    const dueAt = new Date(due);
    if (due <= now.getTime()) {
      const days = pacificDayDiff(dueAt, now);
      return { label: days > 0 ? `Overdue ${days}d` : "Overdue", tone: "danger", basis: "due" };
    }
    const days = pacificDayDiff(now, dueAt);
    return { label: dueLabel(dueAt, now), tone: days < 7 ? "warning" : "neutral", basis: "due" };
  }
  const since = time(item.waitingSince);
  if (since === null) return null;
  return { label: `Waiting ${waitingAge(new Date(since), now)}`, tone: "neutral", basis: "waiting" };
}

/**
 * The row's second line: what is needed, plus how long it has waited when the tag shows the
 * deadline instead ("Stage 3 sign-off · waiting 2d").
 */
export function needDetail(item: NeedItem, now: Date = new Date()) {
  const urgency = needUrgency(item, now);
  const since = time(item.waitingSince);
  if (urgency?.basis === "due" && since !== null) {
    return `${item.need} · waiting ${waitingAge(new Date(since), now)}`;
  }
  return item.need;
}
