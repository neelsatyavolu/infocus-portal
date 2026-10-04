import { z } from "zod";
import { mainAppOrigin } from "@/src/lib/hosts";
import { inngest } from "@/src/lib/inngest";
import { MEETINGS_TIME_ZONE, PRODUCER_SERIES, pacificLocalStamp, producerOccurrences, producerSlotStart } from "@/src/lib/meetings/schedule";
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

function origin() {
  return mainAppOrigin().replace(/\/+$/, "");
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
    ...details(`${origin()}/meet/producers`),
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
    ...details(`${origin()}/meet/${meeting.id}`),
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

/** Create the series event once; afterwards keep its guests, title and link in line (PATCH only on a difference). */
async function syncSeries(token: string, rows: { email: string; userId: string | null }[], now: Date) {
  const attendees = calendarAttendees(rows, null);
  const state = await prisma.meetingSeriesCalendar.findUnique({ where: { seriesKey: SERIES_KEY }, select: { googleEventId: true } });
  const existing = state?.googleEventId ? await readEvent(token, state.googleEventId) : null;

  if (!existing || existing.status === "cancelled") {
    const first = producerOccurrences(now)[0];
    const firstStart = producerSlotStart(first?.occurrenceKey ?? pacificDateTime(now).slice(0, 10));
    const created = await calendarApi<GoogleEvent>(token, "POST", "", WRITE, seriesEventBody(firstStart, attendees));
    await prisma.meetingSeriesCalendar.upsert({
      where: { seriesKey: SERIES_KEY },
      create: { seriesKey: SERIES_KEY, googleEventId: created!.id },
      update: { googleEventId: created!.id }
    });
    return created!.id;
  }

  const want = seriesEventBody(now, attendees);
  if (
    !sameAttendees(existing, attendees) ||
    existing.summary !== want.summary ||
    existing.location !== want.location ||
    existing.description !== want.description
  ) {
    await calendarApi(token, "PATCH", `/${encodeURIComponent(existing.id)}`, WRITE, {
      summary: want.summary,
      location: want.location,
      description: want.description,
      attendees: want.attendees,
      guestsCanSeeOtherGuests: false
    });
  }
  return existing.id;
}

/** One series slot moved or cancelled: patch that instance (found by its original start). */
async function syncOccurrence(token: string, seriesEventId: string, occurrenceKey: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { seriesKey_occurrenceKey: { seriesKey: SERIES_KEY, occurrenceKey } },
    select: { startsAt: true, durationMinutes: true, status: true }
  });
  if (!meeting) return;
  const originalStart = producerSlotStart(occurrenceKey);
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
    existing.summary !== want.summary ||
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
  const seriesEventId = await syncSeries(token, rows, now);
  const upcoming = await prisma.meeting.findMany({
    where: { startsAt: { gt: now }, status: { in: ["SCHEDULED", "CANCELED"] } },
    select: { id: true, seriesKey: true, occurrenceKey: true, startsAt: true, durationMinutes: true, status: true, calendarSequence: true }
  });
  for (const meeting of upcoming) {
    if (meeting.seriesKey === SERIES_KEY && meeting.occurrenceKey) {
      const original = producerSlotStart(meeting.occurrenceKey);
      const changed =
        meeting.status === "CANCELED" ||
        meeting.startsAt.getTime() !== original.getTime() ||
        meeting.durationMinutes !== PRODUCER_SERIES.durationMinutes;
      if (changed) await syncOccurrence(token, seriesEventId, meeting.occurrenceKey);
    } else if (!meeting.seriesKey && meeting.calendarSequence > 0) {
      await syncOneOff(token, meeting.id, rows, now);
    }
  }
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
      const seriesEventId = await syncSeries(token, await inviteRows(), now);
      await syncOccurrence(token, seriesEventId, job.occurrenceKey);
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
