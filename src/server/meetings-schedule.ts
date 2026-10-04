import { PRODUCER_SERIES, UPCOMING_WINDOW_DAYS, producerOccurrences } from "@/src/lib/meetings/schedule";
import type { MeetingListResponse } from "@/src/lib/meetings/types";
import { prisma } from "@/src/lib/prisma";
import {
  assertCanSeeMeeting,
  meetingDetailSelect,
  meetingSummarySelect,
  toMeetingDetail,
  toMeetingSummary,
  visibleMeetingWhere,
  type MeetingViewer
} from "@/src/server/meetings-access";
import { meetingPeopleByIds } from "@/src/server/meetings-people";
import { isMeetingExec } from "@/src/server/meetings-rules";

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_MEETING_DURATION_MS = 8 * 60 * 60 * 1000;
const PAST_LIMIT = 30;

/**
 * Creates missing default-series slots for the next 21 days. Idempotent: (seriesKey, occurrenceKey)
 * is unique, so moved slots keep their key and are never regenerated, and cancelled ones stay CANCELED.
 */
export async function ensureUpcomingProducerMeetings(now = new Date()) {
  const slots = producerOccurrences(now);
  if (slots.length === 0) return 0;
  const result = await prisma.meeting.createMany({
    data: slots.map((slot) => ({
      title: PRODUCER_SERIES.title,
      startsAt: slot.startsAt,
      durationMinutes: PRODUCER_SERIES.durationMinutes,
      seriesKey: PRODUCER_SERIES.seriesKey,
      occurrenceKey: slot.occurrenceKey
    })),
    skipDuplicates: true
  });
  return result.count;
}

async function ensureUpcomingQuietly(now: Date) {
  try {
    await ensureUpcomingProducerMeetings(now);
  } catch (error) {
    console.error("Producer meeting schedule failed", error instanceof Error ? error.message : error);
  }
}

function hasNotEnded(row: { startsAt: Date; durationMinutes: number }, now: Date) {
  return row.startsAt.getTime() + row.durationMinutes * 60_000 > now.getTime();
}

export async function listMeetings(viewer: MeetingViewer, now = new Date()): Promise<MeetingListResponse> {
  await ensureUpcomingQuietly(now);
  const visible = visibleMeetingWhere(viewer);

  const [live, scheduled, past] = await Promise.all([
    prisma.meeting.findMany({
      where: { AND: [visible, { status: "LIVE" }] },
      orderBy: { startsAt: "asc" },
      select: meetingSummarySelect
    }),
    prisma.meeting.findMany({
      where: {
        AND: [
          visible,
          {
            status: "SCHEDULED",
            startsAt: {
              gte: new Date(now.getTime() - MAX_MEETING_DURATION_MS),
              lte: new Date(now.getTime() + UPCOMING_WINDOW_DAYS * DAY_MS)
            }
          }
        ]
      },
      orderBy: { startsAt: "asc" },
      select: meetingSummarySelect
    }),
    prisma.meeting.findMany({
      where: { AND: [visible, { status: "ENDED" }] },
      orderBy: { startsAt: "desc" },
      take: PAST_LIMIT,
      select: meetingSummarySelect
    })
  ]);

  // A scheduled slot stays "upcoming" until its planned end.
  return {
    live: live.map((row) => toMeetingSummary(row, viewer)),
    upcoming: scheduled.filter((row) => hasNotEnded(row, now)).map((row) => toMeetingSummary(row, viewer)),
    past: past.map((row) => toMeetingSummary(row, viewer)),
    canCreateInviteOnly: isMeetingExec(viewer.role)
  };
}

export async function getMeetingDetail(viewer: MeetingViewer, meetingId: string) {
  const row = await prisma.meeting.findUnique({ where: { id: meetingId }, select: meetingDetailSelect });
  assertCanSeeMeeting(viewer, row);
  return toMeetingDetail(row, viewer, await meetingPeopleByIds(row.inviteeUserIds));
}

/**
 * Stable link for the recurring Producer meeting (/meet/producers): the live occurrence, else the
 * next scheduled one that hasn't ended. Null when there is none.
 */
export async function resolveProducerSeriesMeetingId(now = new Date()) {
  await ensureUpcomingQuietly(now);
  const seriesKey = PRODUCER_SERIES.seriesKey;
  const live = await prisma.meeting.findFirst({
    where: { seriesKey, status: "LIVE" },
    orderBy: { startsAt: "desc" },
    select: { id: true }
  });
  if (live) return live.id;

  const scheduled = await prisma.meeting.findMany({
    where: { seriesKey, status: "SCHEDULED", startsAt: { gte: new Date(now.getTime() - MAX_MEETING_DURATION_MS) } },
    orderBy: { startsAt: "asc" },
    take: 10,
    select: { id: true, startsAt: true, durationMinutes: true }
  });
  return scheduled.find((row) => hasNotEnded(row, now))?.id ?? null;
}

export async function getProducerSeriesCurrent(viewer: MeetingViewer, now = new Date()) {
  const id = await resolveProducerSeriesMeetingId(now);
  if (!id) throw new Error("NOT_FOUND");
  const row = await prisma.meeting.findUniqueOrThrow({ where: { id }, select: meetingSummarySelect });
  return toMeetingSummary(row, viewer);
}
