import type { StatusTone } from "@/components/kit/tone";
import { livestreamAttendeeHours, upcomingLivestreamsFirst } from "@/src/lib/livestream";

/** Shapes returned by GET /api/livestreams and friends (unchanged API). */
export type Person = { id: string; name: string | null; email: string | null };
/** /api/livestreams/members also returns the nickname the schedule already shows. */
export type Member = Person & { nickname?: string | null };
export type LivestreamStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";
export type LivestreamAvailability = "PUBLIC" | "UNLISTED" | "UNCONFIRMED";

export type EventRow = {
  id: string;
  title: string;
  startsAt: string;
  arrivesAt: string | null;
  location: string;
  status: LivestreamStatus;
  availability: LivestreamAvailability;
  hours: number | null;
  capacity: number;
  notes: string;
  manager: Person | null;
  attendees: (Person & { creditHours: number | null })[];
  attendeeCount: number;
  openSlots: number;
  capacityTone: "full" | "one" | "open";
  mySignup: { id: string; status: string; availableFullEvent: boolean } | null;
  pendingSignupCount: number;
};

export type PendingSignup = {
  id: string;
  eventId: string;
  status: string;
  availableFullEvent: boolean;
  note: string;
  createdAt: string;
  user: Person | null;
  event: { id: string; title: string; startsAt: string } | null;
};

export type CompletionRow = {
  userId: string;
  name: string | null;
  email: string | null;
  completedHours: number;
  completedEvents: number;
  requiredHours: number;
  isManager: boolean;
  managedEvents: number;
  requiredManagedEvents: number;
  creditPercent: number;
  /** Hours from livestreams they're signed up for that haven't happened yet. */
  scheduledHours?: number;
  scheduledEvents?: number;
  /** creditPercent plus those scheduled hours (capped at 100). */
  projectedPercent?: number;
  points: number;
};

export type Payload = {
  semester: { label: string; start: string; end: string };
  requiredHours: number;
  canManage: boolean;
  canSignup: boolean;
  canAppointManagers: boolean;
  canViewCompletion: boolean;
  currentUserId: string;
  managers: Person[];
  events: EventRow[];
  pendingSignups: PendingSignup[];
  mySignups: Array<{ id: string; eventId: string; status: string }>;
};

export type View = "schedule" | "signups" | "completion";
export type ScheduleFilter = "all" | "open" | "mine" | "action";
export type PersonalStatus = "crew" | "pending" | "denied";

/** A crew that is still on site counts as "upcoming" for a few hours after the start time. */
export const ON_SITE_MS = 3 * 60 * 60 * 1000;

// ---------------------------------------------------------------- people and dates

export function personLabel(person: { name?: string | null; email?: string | null } | null | undefined) {
  if (!person) return "—";
  return person.name?.trim() || person.email || "Member";
}

/** Members carry the nickname too, so the picker names people the way the schedule does. */
export function memberLabel(member: Member) {
  return member.nickname?.trim() || personLabel(member);
}

/** Crew and manager search: nickname, legal name or email, so either name finds the person. */
export function memberMatches(member: Member, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [member.nickname, member.name, member.email].some((value) => (value ?? "").toLowerCase().includes(q));
}

export function firstName(person: Person) {
  return person.name?.trim().split(/\s+/)[0] || personLabel(person);
}

export function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatWeekday(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short" });
}

export function formatMonth(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short" });
}

export function toLocalInputValue(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Hours without float noise: 2.5, 3, 0.25. */
export function formatHours(hours: number) {
  return String(Number(hours.toFixed(2)));
}

function startOfDay(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/** Before local midnight today: the same split `upcomingLivestreamsFirst` uses. */
export function isPastDay(iso: string, now: Date) {
  return new Date(iso).getTime() < startOfDay(now);
}

/** "Today" / "Tomorrow" for the next two days, otherwise null. */
export function dayWord(iso: string, now: Date) {
  const day = startOfDay(new Date(iso));
  const today = startOfDay(now);
  if (day === today) return "Today";
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return day === tomorrow ? "Tomorrow" : null;
}

export function dayLabel(iso: string, now: Date) {
  return dayWord(iso, now) ?? formatDay(iso);
}

export function arrivalLabel(event: Pick<EventRow, "arrivesAt">) {
  return event.arrivesAt ? `Arrive ${formatTime(event.arrivesAt)}` : "Arrival TBD";
}

// ---------------------------------------------------------------- one event

export function isAttending(event: EventRow, userId: string) {
  return event.attendees.some((attendee) => attendee.id === userId);
}

/** Hours this person earns from the event once it is Completed (same rule as Completion). */
export function attendeeHours(event: EventRow, userId: string) {
  const attendee = event.attendees.find((person) => person.id === userId);
  return attendee ? livestreamAttendeeHours(event.hours, attendee.creditHours) : null;
}

/** True when my credited hours differ from the event default, so the Hours column shows mine. */
export function hasOwnHours(event: EventRow, userId: string) {
  const attendee = event.attendees.find((person) => person.id === userId);
  if (!attendee || attendee.creditHours === null || !event.hours) return false;
  return attendee.creditHours !== event.hours;
}

/** My request on this event: the event's own copy first, then the full list (producers only see PENDING on the event). */
export function myRequestStatus(event: EventRow, mySignups: Payload["mySignups"]) {
  return event.mySignup?.status ?? mySignups.find((signup) => signup.eventId === event.id)?.status ?? null;
}

export function personalStatus(event: EventRow, userId: string, mySignups: Payload["mySignups"]): PersonalStatus | null {
  if (isAttending(event, userId)) return "crew";
  const request = myRequestStatus(event, mySignups);
  if (request === "PENDING") return "pending";
  if (request === "DENIED") return "denied";
  return null;
}

/** Sign up / Request again shows when the API would accept a request (it also accepts past Scheduled events). */
export function canRequest(event: EventRow, payload: Pick<Payload, "canSignup" | "currentUserId" | "mySignups">) {
  if (!payload.canSignup || event.status !== "SCHEDULED" || event.openSlots <= 0) return false;
  if (isAttending(event, payload.currentUserId)) return false;
  return myRequestStatus(event, payload.mySignups) !== "PENDING";
}

/** Past livestreams that were never marked Completed or Cancelled. */
export function needsCompletion(event: EventRow, now: Date) {
  return event.status === "SCHEDULED" && isPastDay(event.startsAt, now);
}

/** Still ahead, or the crew is still on site. */
export function isUpcoming(event: EventRow, now: Date) {
  return new Date(event.startsAt).getTime() >= now.getTime() - ON_SITE_MS;
}

export type CapacityTag = { label: string; tone: StatusTone };

/** A livestream this close that is still short on crew needs a manager's attention. */
export const SOON_MS = 7 * 24 * 60 * 60 * 1000;

/** Upcoming and starting within SOON_MS. */
export function isSoon(event: EventRow, now: Date) {
  return isUpcoming(event, now) && new Date(event.startsAt).getTime() - now.getTime() <= SOON_MS;
}

/**
 * Room on a Scheduled livestream: "Full" or "3 open". Open seats are calm (for students they are
 * good news); only managers see amber, on a livestream within a week that is still short on crew.
 */
export function capacityTag(event: EventRow, now: Date, manager: boolean): CapacityTag | null {
  if (event.status !== "SCHEDULED") return null;
  if (event.openSlots <= 0) return { label: "Full", tone: "neutral" };
  return { label: `${event.openSlots} open`, tone: manager && isSoon(event, now) ? "warning" : "neutral" };
}

// ---------------------------------------------------------------- the schedule

export type ScheduleGroups = { upcoming: EventRow[]; earlier: EventRow[] };

/**
 * Today and later first (by date), then earlier days: the ones still to mark Completed first,
 * then the rest newest first, so the latest past livestream sits closest to today.
 */
export function groupSchedule(events: EventRow[], now: Date): ScheduleGroups {
  const ordered = upcomingLivestreamsFirst(events, now);
  const upcoming = ordered.filter((event) => !isPastDay(event.startsAt, now));
  const past = ordered.filter((event) => isPastDay(event.startsAt, now));
  const newestFirst = (a: EventRow, b: EventRow) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime();
  const open = past.filter((event) => needsCompletion(event, now)).sort(newestFirst);
  const rest = past.filter((event) => !needsCompletion(event, now)).sort(newestFirst);
  return { upcoming, earlier: [...open, ...rest] };
}

export function scheduleCounts(events: EventRow[]) {
  return {
    total: events.length,
    scheduled: events.filter((event) => event.status === "SCHEDULED").length,
    completed: events.filter((event) => event.status === "COMPLETED").length,
    cancelled: events.filter((event) => event.status === "CANCELLED").length
  };
}

/** Open seats on every Scheduled livestream (the page's long-standing "Open slots" number). */
export function openSlotStats(events: EventRow[]) {
  const open = events.filter((event) => event.status === "SCHEDULED" && event.openSlots > 0);
  return { slots: open.reduce((sum, event) => sum + event.openSlots, 0), events: open.length };
}

function soonest(events: EventRow[]) {
  return [...events].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0] ?? null;
}

export function nextLivestream(events: EventRow[], now: Date) {
  return soonest(events.filter((event) => event.status === "SCHEDULED" && isUpcoming(event, now)));
}

export function nextCall(events: EventRow[], userId: string, now: Date) {
  return soonest(
    events.filter((event) => event.status === "SCHEDULED" && isUpcoming(event, now) && isAttending(event, userId))
  );
}

/** My hours this semester from the events already loaded (same rule and window as Completion). */
export function personalHours(events: EventRow[], userId: string, now: Date) {
  let hours = 0;
  let completed = 0;
  let waiting = 0;
  for (const event of events) {
    if (!isAttending(event, userId)) continue;
    if (event.status === "COMPLETED") {
      hours += attendeeHours(event, userId) ?? 0;
      completed += 1;
    } else if (needsCompletion(event, now)) {
      waiting += 1;
    }
  }
  return { hours: Number(hours.toFixed(2)), completed, waiting };
}

/** Appointed managers earn credit per Completed livestream they manage (hours > 0). */
export function managedCount(events: EventRow[], userId: string) {
  return events.filter((event) => event.status === "COMPLETED" && event.manager?.id === userId && (event.hours ?? 0) > 0)
    .length;
}

export function requestCounts(events: EventRow[], userId: string, mySignups: Payload["mySignups"]) {
  let pending = 0;
  let denied = 0;
  for (const event of events) {
    const status = personalStatus(event, userId, mySignups);
    if (status === "pending") pending += 1;
    if (status === "denied") denied += 1;
  }
  return { pending, denied };
}

/** Managers get "Needs action"; anyone who can request a slot gets "Open" and "Mine" (producers get both). */
export function scheduleFilterOptions(payload: Pick<Payload, "canManage" | "canSignup">): ScheduleFilter[] {
  const options: ScheduleFilter[] = ["all"];
  if (payload.canManage) options.push("action");
  if (payload.canSignup) options.push("open", "mine");
  return options;
}

export function filterSchedule(events: EventRow[], filter: ScheduleFilter, payload: Payload, now: Date): EventRow[] {
  if (filter === "open") {
    return events.filter((event) => isUpcoming(event, now) && canRequest(event, payload));
  }
  if (filter === "mine") {
    return events.filter((event) => personalStatus(event, payload.currentUserId, payload.mySignups) !== null);
  }
  if (filter === "action") {
    return events.filter((event) => event.pendingSignupCount > 0 || needsCompletion(event, now));
  }
  return events;
}

/** How many livestreams each filter would show (the counts on the filter segments). */
export function scheduleFilterCounts(payload: Payload, now: Date): Record<ScheduleFilter, number> {
  const count = (filter: ScheduleFilter) => filterSchedule(payload.events, filter, payload, now).length;
  return { all: payload.events.length, open: count("open"), mine: count("mine"), action: count("action") };
}

// ---------------------------------------------------------------- sign-up queue

export type RequestGroup = {
  key: string;
  title: string;
  startsAt: string | null;
  /** The full event when it is in this semester's schedule (crew and capacity). */
  event: EventRow | null;
  /** Pending requests can point at events outside the loaded semester. */
  otherSemester: boolean;
  requests: PendingSignup[];
};

/** Pending requests grouped by event: upcoming events first, requests oldest first. */
export function groupRequests(pending: PendingSignup[], events: EventRow[], now: Date): RequestGroup[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  const groups = new Map<string, RequestGroup>();
  for (const request of pending) {
    const key = request.event ? request.eventId : `unknown-${request.eventId}`;
    const existing = groups.get(key);
    if (existing) {
      groups.set(key, { ...existing, requests: [...existing.requests, request] });
      continue;
    }
    const event = byId.get(request.eventId) ?? null;
    groups.set(key, {
      key,
      title: request.event?.title ?? "Event",
      startsAt: request.event?.startsAt ?? null,
      event,
      otherSemester: Boolean(request.event) && !event,
      requests: [request]
    });
  }
  const oldestFirst = (a: PendingSignup, b: PendingSignup) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  const all = [...groups.values()].map((group) => ({ ...group, requests: [...group.requests].sort(oldestFirst) }));
  const dated = all.filter((group): group is RequestGroup & { startsAt: string } => group.startsAt !== null);
  const undated = all.filter((group) => group.startsAt === null);
  const byDate = [...dated].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return [...upcomingLivestreamsFirst(byDate, now), ...undated];
}

// ---------------------------------------------------------------- completion roster

export type CompletionFilter = "all" | "below";

export function filterCompletion(rows: CompletionRow[], query: string, filter: CompletionFilter) {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter === "below" && row.creditPercent >= 100) return false;
    if (!q) return true;
    return (row.name ?? "").toLowerCase().includes(q) || (row.email ?? "").toLowerCase().includes(q);
  });
}

export function fullCreditCount(rows: CompletionRow[]) {
  return rows.filter((row) => row.creditPercent >= 100).length;
}

// ---------------------------------------------------------------- views

export function allowedViews(payload: Pick<Payload, "canManage" | "canViewCompletion"> | null): View[] {
  if (!payload?.canManage) return ["schedule"];
  return payload.canViewCompletion ? ["schedule", "signups", "completion"] : ["schedule", "signups"];
}

export const VIEW_TITLES: Record<View, string> = {
  schedule: "Schedule",
  signups: "Sign ups",
  completion: "Completion"
};
