import { z } from "zod";
import { meetingUrl, producersMeetingUrl } from "@/src/lib/meetings/links";
import { inngest } from "@/src/lib/inngest";
import {
  MEETINGS_TIME_ZONE,
  PRODUCER_SERIES,
  pacificDateKey,
  pacificLocalStamp,
  producerOccurrences,
  producerSlotStart
} from "@/src/lib/meetings/schedule";
import { prisma } from "@/src/lib/prisma";
import { GoogleCalendarError, googleCalendarAccessToken, googleCalendarConnection } from "@/src/server/google-calendar-credential";
import { execUserIds } from "@/src/server/meetings-people";
import type { MeetingAccessFields } from "@/src/server/meetings-rules";

/**
 * Meeting invites as native Google Calendar events on the connected InFocus account's primary
 * calendar. Every write uses sendUpdates=all, so Google itself emails guests invites, updates and
 * cancellations. All writes run in the Inngest job `meetings/invites.send` (retried); the user
 * action never waits on Google. Not connected: nothing happens.
 */

const SERIES_KEY = PRODUCER_SERIES.seriesKey;
const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const REQUEST_TIMEOUT_MS = 20_000;
export const MEETING_CALENDAR_EVENT = "meetings/invites.send";
export const MEETING_CALENDAR_DESCRIPTION = "Encrypted InFocus meeting. Sign in with your InFocus account.";
const SERIES_RRULE = "RRULE:FREQ=WEEKLY;BYDAY=SU,MO,WE";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Older queued payloads (.ics era) are mapped onto the new kinds. */
const jobSchema = z.preprocess(
  (raw) => {
    const value = (raw ?? {}) as { kind?: unknown; occurrenceKey?: unknown };
    if (value.kind === "series") return { kind: "sync" };
    if (value.kind === "move" || value.kind === "cancel") {
      return { kind: "occurrence", occurrenceKey: value.occurrenceKey };
    }
    return raw;
  },
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("sync") }),
    z.object({ kind: z.literal("occurrence"), occurrenceKey: dateKey }),
    z.object({ kind: z.literal("event"), meetingId: z.string().min(1).max(64) })
  ])
);
export type MeetingCalendarJob = z.infer<typeof jobSchema>;

class CalendarApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  attendees?: { email?: string }[];
  recurrence?: string[];
  originalStartTime?: { dateTime?: string };
};

async function calendarApi<T>(
  token: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  query: Record<string, string> = {},
  body?: unknown
): Promise<T | null> {
  const url = new URL(`${EVENTS_URL}${path}`);
  url.search = new URLSearchParams(query).toString();
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) {
    const reason = await response
      .json()
      .then((json: { error?: { message?: unknown } }) => (typeof json.error?.message === "string" ? json.error.message : ""))
      .catch(() => "");
    throw new CalendarApiError(response.status, `Google Calendar refused (HTTP ${response.status})${reason ? `: ${reason}` : ""}`);
  }
  if (response.status === 204) return null;
  return (await response.json()) as T;
}

const WRITE = { sendUpdates: "all", conferenceDataVersion: "0" };

function isGone(error: unknown) {
  return error instanceof CalendarApiError && (error.status === 404 || error.status === 410);
}


/** "2026-10-04T21:15:00" in Pacific wall time, sent with timeZone America/Los_Angeles. */
function pacificDateTime(instant: Date) {
  const s = pacificLocalStamp(instant);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}`;
}

function times(start: Date, durationMinutes: number) {
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return {
    start: { dateTime: pacificDateTime(start), timeZone: MEETINGS_TIME_ZONE },
    end: { dateTime: pacificDateTime(end), timeZone: MEETINGS_TIME_ZONE }
  };
}

function details(url: string) {
  return { location: url, description: `${url}\n\n${MEETING_CALENDAR_DESCRIPTION}` };
}

/**
 * Guests for an event. The series and OPEN meetings: every address on the invite list.
 * INVITE_ONLY: only addresses linked to the creator or an invitee. EXECS_ONLY: only addresses linked
 * to an exec (`execIds`). Unlinked addresses never join a restricted meeting.
 */
export function calendarAttendees(
  rows: { email: string; userId: string | null }[],
  meeting: MeetingAccessFields | null,
  execIds: string[] = []
) {
  const allowed =
    !meeting || meeting.access === "OPEN"
      ? null
      : meeting.access === "EXECS_ONLY"
        ? new Set(execIds)
        : new Set([...(meeting.createdById ? [meeting.createdById] : []), ...meeting.inviteeUserIds]);
  const emails = rows
    .filter((row) => allowed === null || Boolean(row.userId && allowed.has(row.userId)))
    .map((row) => row.email.toLowerCase());
  return [...new Set(emails)].sort();
}

function attendeeList(emails: string[]) {
  return emails.map((email) => ({ email }));
}

/** The recurring InFocus Producer Meeting: one event, weekly Sun/Mon/Wed at 21:15 Pacific, no Meet link. */
export function seriesEventBody(firstStart: Date, attendees: string[]) {
  return {
    summary: PRODUCER_SERIES.title,
    ...details(producersMeetingUrl()),
    ...times(firstStart, PRODUCER_SERIES.durationMinutes),
    recurrence: [SERIES_RRULE],
    attendees: attendeeList(attendees),
    guestsCanSeeOtherGuests: false,
    reminders: { useDefault: false }
  };
}

export function oneOffEventBody(
  meeting: { id: string; title: string; startsAt: Date; durationMinutes: number },
  attendees: string[]
) {
  return {
    summary: meeting.title,
    ...details(meetingUrl(meeting.id)),
    ...times(meeting.startsAt, meeting.durationMinutes),
    attendees: attendeeList(attendees),
    guestsCanSeeOtherGuests: false,
    reminders: { useDefault: false }
  };
}

function sameAttendees(event: GoogleEvent, emails: string[]) {
  const current = [...new Set((event.attendees ?? []).map((a) => (a.email ?? "").toLowerCase()).filter(Boolean))].sort();
  return current.length === emails.length && current.every((email, index) => email === emails[index]);
}

/** Title, link (location) and description match, e.g. after the meeting link moved to the Meetings host. */
function sameDetails(event: GoogleEvent, want: { summary: string; location: string; description: string }) {
  return event.summary === want.summary && event.location === want.location && event.description === want.description;
}

/** How far ahead "Sync now" checks the series' individual occurrences. */
const INSTANCE_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Upcoming occurrences of the series that carry their own copy of the title, link or description
 * (Google keeps those on moved/edited instances): PATCH any that differ from the series. Unchanged
 * instances follow the series event and already match, so they're left alone.
 */
async function syncSeriesInstances(token: string, seriesEventId: string, now: Date) {
  const want = details(producersMeetingUrl());
  const found = await calendarApi<{ items?: GoogleEvent[] }>(token, "GET", `/${encodeURIComponent(seriesEventId)}/instances`, {
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + INSTANCE_WINDOW_MS).toISOString(),
    maxResults: "250"
  });
  for (const instance of found?.items ?? []) {
    if (instance.status === "cancelled") continue;
    // Google's timeMin also returns an occurrence already under way; only touch ones still to come.
    if (!instance.start?.dateTime || new Date(instance.start.dateTime).getTime() < now.getTime()) continue;
    if (sameDetails(instance, { summary: PRODUCER_SERIES.title, ...want })) continue;
    await calendarApi(token, "PATCH", `/${encodeURIComponent(instance.id)}`, WRITE, { summary: PRODUCER_SERIES.title, ...want });
  }
}

function sameStart(event: GoogleEvent, start: Date, durationMinutes: number) {
  const s = event.start?.dateTime ? new Date(event.start.dateTime).getTime() : NaN;
  const e = event.end?.dateTime ? new Date(event.end.dateTime).getTime() : NaN;
  return s === start.getTime() && e === start.getTime() + durationMinutes * 60_000;
}

async function inviteRows() {
  return prisma.meetingInviteEmail.findMany({ where: { seriesKey: SERIES_KEY }, select: { id: true, email: true, userId: true } });
}

async function readEvent(token: string, id: string) {
  try {
    return await calendarApi<GoogleEvent>(token, "GET", `/${encodeURIComponent(id)}`);
  } catch (error) {
    if (isGone(error)) return null;
    throw error;
  }
}

/** Start (UTC) of the last series slot (Sun/Mon/Wed 21:15 Pacific) that began before `now`. */
export function lastSlotStartBefore(now: Date) {
  for (let back = 0; back <= 7; back += 1) {
    const key = pacificDateKey(new Date(now.getTime() - back * 24 * 60 * 60 * 1000));
    const weekday = new Date(`${key}T12:00:00.000Z`).getUTCDay();
    if (!PRODUCER_SERIES.weekdays.includes(weekday)) continue;
    const start = producerSlotStart(key);
    if (start.getTime() < now.getTime()) return start;
  }
  return null;
}

/** "RRULE:…;UNTIL=20261005T041500Z": the same rule ending at `until` (UTC, as RFC 5545 needs with a TZID start). */
export function rruleUntil(rule: string, until: Date) {
  const stamp = until.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const parts = rule
    .replace(/^RRULE:/, "")
    .split(";")
    .filter((part) => part && !/^(UNTIL|COUNT)=/i.test(part));
  return `RRULE:${[...parts, `UNTIL=${stamp}`].join(";")}`;
}

/**
 * Keep the series in line with only upcoming dates changing.
 * - None yet: create it from the next slot.
 * - Title, link or description differ and an occurrence already happened: split ("this and
 *   following"). The old event's rule gets UNTIL at the last slot before now, so past dates keep
 *   their old content, and a new event starts at the next slot with the new content and guests.
 * - Otherwise PATCH in place: nothing has happened yet, or only the guest list changed. Guests are
 *   series-wide in Google (it shows them on past dates too), but no past content is rewritten.
 * Returns the current event id and whether a split happened (exceptions must be re-applied).
 */
async function syncSeries(token: string, rows: { email: string; userId: string | null }[], now: Date) {
  const attendees = calendarAttendees(rows, null);
  const state = await prisma.meetingSeriesCalendar.findUnique({ where: { seriesKey: SERIES_KEY }, select: { googleEventId: true } });
  const existing = state?.googleEventId ? await readEvent(token, state.googleEventId) : null;
  const nextSlot = () => {
    const next = producerOccurrences(now).find((slot) => slot.startsAt.getTime() > now.getTime());
    return next?.startsAt ?? producerSlotStart(pacificDateKey(now));
  };
  const createSeries = async () => {
    const created = await calendarApi<GoogleEvent>(token, "POST", "", WRITE, seriesEventBody(nextSlot(), attendees));
    await prisma.meetingSeriesCalendar.upsert({
      where: { seriesKey: SERIES_KEY },
      create: { seriesKey: SERIES_KEY, googleEventId: created!.id },
      update: { googleEventId: created!.id }
    });
    return created!.id;
  };

  if (!existing || existing.status === "cancelled") return { id: await createSeries(), split: false };

  const want = seriesEventBody(now, attendees);
  const contentChanged = !sameDetails(existing, want);
  if (!contentChanged && sameAttendees(existing, attendees)) return { id: existing.id, split: false };

  const seriesStart = existing.start?.dateTime ? new Date(existing.start.dateTime).getTime() : Infinity;
  const lastPast = lastSlotStartBefore(now);
  if (contentChanged && lastPast && seriesStart <= lastPast.getTime()) {
    const recurrence = (existing.recurrence ?? [SERIES_RRULE]).map((line) =>
      line.startsWith("RRULE:") ? rruleUntil(line, lastPast) : line
    );
    await calendarApi(token, "PATCH", `/${encodeURIComponent(existing.id)}`, WRITE, { recurrence });
    return { id: await createSeries(), split: true };
  }

  await calendarApi(token, "PATCH", `/${encodeURIComponent(existing.id)}`, WRITE, {
    summary: want.summary,
    location: want.location,
    description: want.description,
    attendees: want.attendees,
    guestsCanSeeOtherGuests: false
  });
  return { id: existing.id, split: false };
}

/** Moved or cancelled upcoming slots, applied to the series event (after a split they start over on the new one). */
async function syncUpcomingExceptions(token: string, seriesEventId: string, now: Date) {
  const slots = await prisma.meeting.findMany({
    where: { seriesKey: SERIES_KEY, startsAt: { gt: now }, status: { in: ["SCHEDULED", "CANCELED"] } },
    select: { occurrenceKey: true, startsAt: true, durationMinutes: true, status: true }
  });
  for (const slot of slots) {
    if (!slot.occurrenceKey) continue;
    const original = producerSlotStart(slot.occurrenceKey);
    const changed =
      slot.status === "CANCELED" ||
      slot.startsAt.getTime() !== original.getTime() ||
      slot.durationMinutes !== PRODUCER_SERIES.durationMinutes;
    if (changed) await syncOccurrence(token, seriesEventId, slot.occurrenceKey, now);
  }
}

/** One series slot moved or cancelled: patch that instance (found by its original start). */
async function syncOccurrence(token: string, seriesEventId: string, occurrenceKey: string, now: Date) {
  const meeting = await prisma.meeting.findUnique({
    where: { seriesKey_occurrenceKey: { seriesKey: SERIES_KEY, occurrenceKey } },
    select: { startsAt: true, durationMinutes: true, status: true }
  });
  if (!meeting) return;
  const originalStart = producerSlotStart(occurrenceKey);
  // A slot whose date has passed is history: never rewrite it.
  if (originalStart.getTime() < now.getTime()) return;
  const found = await calendarApi<{ items?: GoogleEvent[] }>(token, "GET", `/${encodeURIComponent(seriesEventId)}/instances`, {
    originalStart: originalStart.toISOString().replace(/\.\d{3}Z$/, "Z"),
    showDeleted: "true",
    maxResults: "1"
  });
  const instance = found?.items?.[0];
  if (!instance) return;
  const path = `/${encodeURIComponent(instance.id)}`;
  if (meeting.status === "CANCELED") {
    if (instance.status !== "cancelled") await calendarApi(token, "PATCH", path, WRITE, { status: "cancelled" });
    return;
  }
  if (!sameStart(instance, meeting.startsAt, meeting.durationMinutes)) {
    await calendarApi(token, "PATCH", path, WRITE, times(meeting.startsAt, meeting.durationMinutes));
  }
}

/** A one-off meeting scheduled ahead: create, keep in line (time, title, guests), or delete when cancelled. */
async function syncOneOff(token: string, meetingId: string, rows: { email: string; userId: string | null }[], now: Date) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      title: true,
      startsAt: true,
      durationMinutes: true,
      status: true,
      access: true,
      createdById: true,
      inviteeUserIds: true,
      seriesKey: true,
      calendarSequence: true,
      googleEventId: true
    }
  });
  if (!meeting || meeting.seriesKey || meeting.calendarSequence === 0) return;
  // Only upcoming or running meetings: an event whose end has passed is never edited or deleted.
  if (meeting.startsAt.getTime() + meeting.durationMinutes * 60_000 <= now.getTime()) return;

  if (meeting.status === "CANCELED") {
    if (!meeting.googleEventId) return;
    try {
      await calendarApi(token, "DELETE", `/${encodeURIComponent(meeting.googleEventId)}`, { sendUpdates: "all" });
    } catch (error) {
      if (!isGone(error)) throw error;
    }
    await prisma.meeting.update({ where: { id: meeting.id }, data: { googleEventId: null } });
    return;
  }
  if (meeting.status === "ENDED") return;

  const attendees = calendarAttendees(rows, meeting, meeting.access === "EXECS_ONLY" ? await execUserIds() : []);
  const want = oneOffEventBody(meeting, attendees);
  const existing = meeting.googleEventId ? await readEvent(token, meeting.googleEventId) : null;
  if (!existing || existing.status === "cancelled") {
    if (meeting.status !== "SCHEDULED" || meeting.startsAt.getTime() <= now.getTime()) return;
    const created = await calendarApi<GoogleEvent>(token, "POST", "", WRITE, want);
    await prisma.meeting.update({ where: { id: meeting.id }, data: { googleEventId: created!.id } });
    return;
  }
  if (
    !sameAttendees(existing, attendees) ||
    !sameDetails(existing, want) ||
    !sameStart(existing, meeting.startsAt, meeting.durationMinutes)
  ) {
    await calendarApi(token, "PATCH", `/${encodeURIComponent(existing.id)}`, WRITE, {
      summary: want.summary,
      location: want.location,
      description: want.description,
      start: want.start,
      end: want.end,
      attendees: want.attendees
    });
  }
}

/** "Sync now": the series (guests), its moved or cancelled upcoming slots, and every upcoming one-off event. */
async function fullSync(token: string, now: Date) {
  const rows = await inviteRows();
  const series = await syncSeries(token, rows, now);
  await syncSeriesInstances(token, series.id, now);
  await syncUpcomingExceptions(token, series.id, now);
  const oneOffs = await prisma.meeting.findMany({
    where: { seriesKey: null, calendarSequence: { gt: 0 }, startsAt: { gt: now }, status: { in: ["SCHEDULED", "CANCELED"] } },
    select: { id: true }
  });
  for (const meeting of oneOffs) await syncOneOff(token, meeting.id, rows, now);
  // Everyone on the list is now a guest of the series.
  await prisma.meetingInviteEmail.updateMany({ where: { seriesKey: SERIES_KEY, lastInvitedAt: null }, data: { lastInvitedAt: now } });
}

function shortReason(error: unknown) {
  const message = error instanceof CalendarApiError || error instanceof GoogleCalendarError ? error.message : "Unexpected error";
  return message.length > 200 ? `${message.slice(0, 199)}…` : message;
}

async function recordSync(now: Date, error: string | null) {
  await prisma.meetingSeriesCalendar.upsert({
    where: { seriesKey: SERIES_KEY },
    create: { seriesKey: SERIES_KEY, ...(error ? { lastSyncError: error } : { lastSyncedAt: now, lastSyncError: null }) },
    update: error ? { lastSyncError: error } : { lastSyncedAt: now, lastSyncError: null }
  });
}

/** Inngest job: one calendar action. Throws on failure so Inngest retries; the panel shows the reason. */
export async function runMeetingCalendarJob(data: unknown, now = new Date()) {
  const job = jobSchema.parse(data);
  try {
    const token = await googleCalendarAccessToken();
    if (!token) return { skipped: "not-connected" as const };
    if (job.kind === "sync") {
      await fullSync(token, now);
    } else if (job.kind === "event") {
      await syncOneOff(token, job.meetingId, await inviteRows(), now);
    } else {
      const series = await syncSeries(token, await inviteRows(), now);
      // After a split, every upcoming moved/cancelled slot (this one included) goes onto the new event.
      if (series.split) await syncUpcomingExceptions(token, series.id, now);
      else await syncOccurrence(token, series.id, job.occurrenceKey, now);
    }
    await recordSync(now, null);
    return { synced: job.kind };
  } catch (error) {
    const reason = shortReason(error);
    console.error("Meetings Google Calendar sync failed", reason);
    await recordSync(now, reason).catch(() => undefined);
    throw error;
  }
}

/** Never throws: a failed enqueue is logged and the triggering action still succeeds. */
export async function queueMeetingCalendar(job: MeetingCalendarJob) {
  try {
    await inngest.send({ name: MEETING_CALENDAR_EVENT, data: job });
    return true;
  } catch (error) {
    console.error("Meetings calendar enqueue failed", error instanceof Error ? error.message : error);
    return false;
  }
}

export type MeetingsCalendarStatus = {
  connected: boolean;
  accountEmail: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

export async function meetingsCalendarStatus(): Promise<MeetingsCalendarStatus> {
  const [connection, state] = await Promise.all([
    googleCalendarConnection(),
    prisma.meetingSeriesCalendar.findUnique({ where: { seriesKey: SERIES_KEY }, select: { lastSyncedAt: true, lastSyncError: true } })
  ]);
  return {
    connected: Boolean(connection),
    accountEmail: connection?.accountEmail ?? null,
    connectedAt: connection?.connectedAt.toISOString() ?? null,
    lastSyncedAt: state?.lastSyncedAt?.toISOString() ?? null,
    lastSyncError: state?.lastSyncError ?? null
  };
}
