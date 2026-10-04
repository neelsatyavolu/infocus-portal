import { PRODUCER_SERIES } from "@/src/lib/meetings/schedule";
import { prisma } from "@/src/lib/prisma";
import {
  assertCanSeeMeeting,
  isMeetingHostOrPromoted,
  meetingSummarySelect,
  toMeetingSummary,
  type MeetingViewer
} from "@/src/server/meetings-access";
import { queueMeetingCalendar } from "@/src/server/meetings-google-calendar";
import { ensureMeetingKey } from "@/src/server/meetings-keys";
import { removeMeetingParticipants } from "@/src/server/meetings-moderation";
import { validateInvitees } from "@/src/server/meetings-people";
import { sendMeetingRoomEvent } from "@/src/server/meetings-room-client";
import { isMeetingExec, isMeetingOpen } from "@/src/server/meetings-rules";
import { startMeetingScribe, stopMeetingScribe } from "@/src/server/meetings-scribe";

/** Create a meeting; move, cancel, retitle, re-invite or change settings of one. */

/** A one-off meeting this far ahead gets a Google Calendar event; anything sooner is "Start now". */
export const CALENDAR_INVITE_LEAD_MS = 10 * 60 * 1000;

export async function createMeeting(
  viewer: MeetingViewer,
  input: {
    title: string;
    startsAt?: Date;
    durationMinutes?: number;
    access?: "OPEN" | "INVITE_ONLY" | "EXECS_ONLY";
    inviteeUserIds?: string[];
  },
  now = new Date()
) {
  const access = input.access ?? "OPEN";
  if (access !== "OPEN" && !isMeetingExec(viewer.role)) throw new Error("FORBIDDEN");
  // EXECS_ONLY always includes every exec, so it keeps no list.
  const invitees = access === "EXECS_ONLY" ? [] : await validateInvitees(input.inviteeUserIds ?? [], viewer.userId);
  if (access === "INVITE_ONLY" && invitees.length === 0) throw new Error("Invite at least one producer.");

  const startsAt = input.startsAt ?? now;
  const sendsInvites = startsAt.getTime() - now.getTime() > CALENDAR_INVITE_LEAD_MS;
  const row = await prisma.meeting.create({
    data: {
      title: input.title,
      startsAt,
      calendarSequence: sendsInvites ? 1 : 0,
      durationMinutes: input.durationMinutes ?? PRODUCER_SERIES.durationMinutes,
      access,
      inviteeUserIds: invitees,
      createdById: viewer.userId
    },
    select: meetingSummarySelect
  });
  if (sendsInvites) await queueMeetingCalendar({ kind: "event", meetingId: row.id });
  return toMeetingSummary(row, viewer);
}

export type MeetingUpdateInput = {
  title?: string;
  startsAt?: Date;
  durationMinutes?: number;
  quickAccess?: boolean;
  notesEnabled?: boolean;
  status?: "CANCELED";
  inviteeUserIds?: string[];
};

const editSelect = {
  id: true,
  title: true,
  startsAt: true,
  durationMinutes: true,
  status: true,
  access: true,
  createdById: true,
  inviteeUserIds: true,
  quickAccess: true,
  notesEnabled: true,
  seriesKey: true,
  occurrenceKey: true,
  calendarSequence: true
} as const;

export async function updateMeeting(viewer: MeetingViewer, meetingId: string, input: MeetingUpdateInput, now = new Date()) {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: editSelect });
  assertCanSeeMeeting(viewer, meeting);
  if (!(await isMeetingHostOrPromoted(viewer, meeting))) throw new Error("FORBIDDEN");
  if (!isMeetingOpen(meeting.status)) throw new Error("This meeting is over and can't be changed.");
  const isLive = meeting.status === "LIVE";
  if (input.status === "CANCELED" && isLive) throw new Error("End a live meeting instead of cancelling it.");
  if ((input.startsAt || input.durationMinutes) && isLive) throw new Error("A live meeting can't be moved.");

  let invitees: string[] | undefined;
  if (input.inviteeUserIds) {
    if (meeting.seriesKey) throw new Error("The InFocus Producer Meeting is open to every producer.");
    if (meeting.access === "EXECS_ONLY") throw new Error("Execs-only meetings include every exec.");
    invitees = await validateInvitees(input.inviteeUserIds, meeting.createdById ?? viewer.userId);
    if (meeting.access === "INVITE_ONLY" && invitees.length === 0) throw new Error("Invite at least one producer.");
  }

  const moved = Boolean(input.startsAt || input.durationMinutes);
  const dropped = invitees ? meeting.inviteeUserIds.filter((id) => !invitees.includes(id)) : [];

  const row = await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      title: input.title,
      durationMinutes: input.durationMinutes,
      quickAccess: input.quickAccess,
      notesEnabled: input.notesEnabled,
      status: input.status,
      inviteeUserIds: invitees,
      ...(input.startsAt ? { startsAt: input.startsAt } : {}),
      // A moved meeting reminds again at its new time.
      ...(moved ? { reminder15SentAt: null, reminder5SentAt: null } : {})
    },
    select: meetingSummarySelect
  });

  if (isLive) await applyLiveSettingsChange(meeting, row);
  if (meeting.access === "INVITE_ONLY" && isLive && dropped.length > 0) {
    await removeMeetingParticipants(meeting, dropped, now);
  }
  const calendarJob = calendarJobFor(meeting, input, moved);
  if (calendarJob) await queueMeetingCalendar(calendarJob);
  return toMeetingSummary(row, viewer);
}

/**
 * The Google Calendar sync a change needs. Series slot moved or cancelled → patch that instance.
 * One-off meeting with an event (scheduled ahead) → reconcile it (time, title, guests, or delete).
 */
export function calendarJobFor(
  meeting: { id: string; seriesKey: string | null; occurrenceKey: string | null; calendarSequence: number },
  input: MeetingUpdateInput,
  moved: boolean
) {
  if (meeting.seriesKey === PRODUCER_SERIES.seriesKey && meeting.occurrenceKey) {
    return input.status === "CANCELED" || moved ? { kind: "occurrence" as const, occurrenceKey: meeting.occurrenceKey } : null;
  }
  if (meeting.seriesKey || meeting.calendarSequence === 0) return null;
  const changed = input.status === "CANCELED" || moved || input.title !== undefined || input.inviteeUserIds !== undefined;
  return changed ? { kind: "event" as const, meetingId: meeting.id } : null;
}

async function applyLiveSettingsChange(
  before: { id: string; title: string; startsAt: Date; quickAccess: boolean; notesEnabled: boolean },
  after: { quickAccess: boolean; notesEnabled: boolean }
) {
  if (before.quickAccess === after.quickAccess && before.notesEnabled === after.notesEnabled) return;
  await sendMeetingRoomEvent(before.id, {
    t: "settings",
    settings: { quickAccess: after.quickAccess, notesEnabled: after.notesEnabled }
  });
  if (before.notesEnabled === after.notesEnabled) return;
  if (after.notesEnabled) {
    await startMeetingScribe(before, await ensureMeetingKey(before.id));
  } else {
    await stopMeetingScribe(before.id);
  }
}
