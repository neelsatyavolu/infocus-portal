import { PRODUCER_SERIES } from "@/src/lib/meetings/schedule";
import { prisma } from "@/src/lib/prisma";
import {
  assertCanSeeMeeting,
  meetingSummarySelect,
  toMeetingSummary,
  type MeetingViewer
} from "@/src/server/meetings-access";
import { queueMeetingInvites } from "@/src/server/meetings-invite-mail";
import { ensureMeetingKey } from "@/src/server/meetings-keys";
import { removeMeetingParticipants } from "@/src/server/meetings-moderation";
import { validateInvitees } from "@/src/server/meetings-people";
import { sendMeetingRoomEvent } from "@/src/server/meetings-room-client";
import { isMeetingExec, isMeetingHost, isMeetingOpen } from "@/src/server/meetings-rules";
import { startMeetingScribe, stopMeetingScribe } from "@/src/server/meetings-scribe";

/** Create a meeting; move, cancel, retitle, re-invite or change settings of one. */

/** A one-off meeting this far ahead gets calendar invites; anything sooner is "Start now". */
export const CALENDAR_INVITE_LEAD_MS = 10 * 60 * 1000;

export async function createMeeting(
  viewer: MeetingViewer,
  input: {
    title: string;
    startsAt?: Date;
    durationMinutes?: number;
    access?: "OPEN" | "INVITE_ONLY";
    inviteeUserIds?: string[];
  },
  now = new Date()
) {
  const access = input.access ?? "OPEN";
  if (access === "INVITE_ONLY" && !isMeetingExec(viewer.role)) throw new Error("FORBIDDEN");
  const invitees = await validateInvitees(input.inviteeUserIds ?? [], viewer.userId);
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
  if (sendsInvites) await queueMeetingInvites({ kind: "event", meetingId: row.id, method: "REQUEST", sequence: 1 });
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
  if (!isMeetingHost(viewer, meeting)) throw new Error("FORBIDDEN");
  if (!isMeetingOpen(meeting.status)) throw new Error("This meeting is over and can't be changed.");
  const isLive = meeting.status === "LIVE";
  if (input.status === "CANCELED" && isLive) throw new Error("End a live meeting instead of cancelling it.");
  if ((input.startsAt || input.durationMinutes) && isLive) throw new Error("A live meeting can't be moved.");

  let invitees: string[] | undefined;
  if (input.inviteeUserIds) {
    if (meeting.seriesKey) throw new Error("The InFocus Producer Meeting is open to every producer.");
    invitees = await validateInvitees(input.inviteeUserIds, meeting.createdById ?? viewer.userId);
    if (meeting.access === "INVITE_ONLY" && invitees.length === 0) throw new Error("Invite at least one producer.");
  }

  const moved = Boolean(input.startsAt || input.durationMinutes);
  const added = invitees ? invitees.filter((id) => !meeting.inviteeUserIds.includes(id)) : [];
  const dropped = invitees ? meeting.inviteeUserIds.filter((id) => !invitees.includes(id)) : [];
  const calendar = calendarChanges(meeting, input, moved, added, dropped);

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
      ...(moved ? { reminder15SentAt: null, reminder5SentAt: null } : {}),
      ...(calendar.length > 0 ? { calendarSequence: { increment: 1 } } : {})
    },
    select: { ...meetingSummarySelect, calendarSequence: true }
  });

  if (isLive) await applyLiveSettingsChange(meeting, row);
  if (meeting.access === "INVITE_ONLY" && isLive && dropped.length > 0) {
    await removeMeetingParticipants(meeting, dropped, now);
  }
  for (const job of calendar) {
    await queueMeetingInvites({ kind: "event", meetingId, sequence: row.calendarSequence, ...job });
  }
  if (meeting.seriesKey === PRODUCER_SERIES.seriesKey && meeting.occurrenceKey) {
    if (input.status === "CANCELED") {
      await queueMeetingInvites({ kind: "cancel", occurrenceKey: meeting.occurrenceKey, durationMinutes: row.durationMinutes });
    } else if (moved) {
      await queueMeetingInvites({
        kind: "move",
        occurrenceKey: meeting.occurrenceKey,
        startsAt: row.startsAt.toISOString(),
        durationMinutes: row.durationMinutes
      });
    }
  }
  return toMeetingSummary(row, viewer);
}

/**
 * Calendar emails a one-off meeting's change needs (only meetings that sent invites at creation):
 * cancel or move/retitle → everyone; INVITE_ONLY list changes → REQUEST to added, CANCEL to dropped.
 */
export function calendarChanges(
  meeting: { seriesKey: string | null; calendarSequence: number; access: "OPEN" | "INVITE_ONLY" },
  input: MeetingUpdateInput,
  moved: boolean,
  added: string[],
  dropped: string[]
): { method: "REQUEST" | "CANCEL"; onlyUserIds?: string[]; uninvited?: boolean }[] {
  if (meeting.seriesKey || meeting.calendarSequence === 0) return [];
  if (input.status === "CANCELED") return [{ method: "CANCEL" }];
  const jobs: { method: "REQUEST" | "CANCEL"; onlyUserIds?: string[]; uninvited?: boolean }[] = [];
  if (moved || input.title !== undefined) jobs.push({ method: "REQUEST" });
  if (meeting.access === "INVITE_ONLY") {
    // A full REQUEST already reaches anyone added.
    if (added.length > 0 && jobs.length === 0) jobs.push({ method: "REQUEST", onlyUserIds: added });
    if (dropped.length > 0) jobs.push({ method: "CANCEL", onlyUserIds: dropped, uninvited: true });
  }
  return jobs;
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
