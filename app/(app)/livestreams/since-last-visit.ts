import type { EventRow, Payload, PersonalStatus } from "./livestreams-model";
import { formatHours, personalHours, personalStatus } from "./livestreams-model";

/** What a student saw last time: their status per event and their completed hours. */
export type PersonalSnapshot = { statuses: Record<string, PersonalStatus>; hours: number };

export type PersonalChanges = {
  /** Events whose status for me changed since the last visit (they get a "New" tag). */
  eventIds: string[];
  /** One short phrase per change, e.g. "On crew for Choir Pops", "+3 h". */
  lines: string[];
  /** A request was denied: the news is not all good, so the banner is not green. */
  hasDenial: boolean;
};

export function personalSnapshot(payload: Pick<Payload, "events" | "currentUserId" | "mySignups">, now: Date): PersonalSnapshot {
  const statuses: Record<string, PersonalStatus> = {};
  for (const event of payload.events) {
    const status = personalStatus(event, payload.currentUserId, payload.mySignups);
    if (status) statuses[event.id] = status;
  }
  return { statuses, hours: personalHours(payload.events, payload.currentUserId, now).hours };
}

export function isPersonalSnapshot(value: unknown): value is PersonalSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PersonalSnapshot>;
  return typeof candidate.hours === "number" && Boolean(candidate.statuses) && typeof candidate.statuses === "object";
}

function changeLine(status: PersonalStatus, title: string) {
  if (status === "crew") return `On crew for ${title}`;
  if (status === "denied") return `Request denied for ${title}`;
  return null;
}

/**
 * What happened to me since `previous`: added to a crew, a request denied, hours credited.
 * My own new requests (pending) are not news, so they are left out.
 */
export function diffSnapshots(previous: PersonalSnapshot, next: PersonalSnapshot, events: EventRow[]): PersonalChanges {
  const eventIds: string[] = [];
  const lines: string[] = [];
  let hasDenial = false;
  for (const event of events) {
    const now = next.statuses[event.id];
    if (!now || now === previous.statuses[event.id]) continue;
    const line = changeLine(now, event.title);
    if (!line) continue;
    eventIds.push(event.id);
    lines.push(line);
    if (now === "denied") hasDenial = true;
  }
  const gained = Number((next.hours - previous.hours).toFixed(2));
  if (gained > 0) lines.push(`+${formatHours(gained)} h`);
  return { eventIds, lines, hasDenial };
}

export function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Requests that arrived after the last visit (for managers). */
export function newSince<T extends { createdAt: string }>(items: T[], lastSeenAt: number | null) {
  if (lastSeenAt === null) return [];
  return items.filter((item) => new Date(item.createdAt).getTime() > lastSeenAt);
}
