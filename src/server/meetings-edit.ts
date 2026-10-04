import { PRODUCER_SERIES } from "@/src/lib/meetings/schedule";
import { prisma } from "@/src/lib/prisma";
import {
  assertCanSeeMeeting,
  meetingSummarySelect,
  toMeetingSummary,
  type MeetingViewer
} from "@/src/server/meetings-access";
import { queueMeetingInvites } from "@/src/server/meetings-invites";
import { ensureMeetingKey } from "@/src/server/meetings-keys";
import { removeMeetingParticipants } from "@/src/server/meetings-moderation";
import { validateInvitees } from "@/src/server/meetings-people";
import { sendMeetingRoomEvent } from "@/src/server/meetings-room-client";
import { isMeetingExec, isMeetingHost, isMeetingOpen } from "@/src/server/meetings-rules";
import { startMeetingScribe, stopMeetingScribe } from "@/src/server/meetings-scribe";

/** Create a meeting; move, cancel, retitle, re-invite or change settings of one. */

export async function createMeeting(
  viewer: MeetingViewer,
  input: {
    title: string;
    startsAt?: Date;
    durationMinutes?: number;
    access?: "OPEN" | "INVITE_ONLY";
    inviteeUserIds?: string[];
  }
) {
  const access = input.access ?? "OPEN";
  if (access === "INVITE_ONLY" && !isMeetingExec(viewer.role)) throw new Error("FORBIDDEN");
  const invitees = await validateInvitees(input.inviteeUserIds ?? [], viewer.userId);
  if (access === "INVITE_ONLY" && invitees.length === 0) throw new Error("Invite at least one producer.");

  const row = await prisma.meeting.create({
    data: {
      title: input.title,
      startsAt: input.startsAt ?? new Date(),
      durationMinutes: input.durationMinutes ?? PRODUCER_SERIES.durationMinutes,
      access,
      inviteeUserIds: invitees,
      createdById: viewer.userId
    },
    select: meetingSummarySelect
  });
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
  occurrenceKey: true
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
    if (meeting.seriesKey) throw new Error("The Producer meeting is open to every producer.");
    invitees = await validateInvitees(input.inviteeUserIds, meeting.createdById ?? viewer.userId);
    if (meeting.access === "INVITE_ONLY" && invitees.length === 0) throw new Error("Invite at least one producer.");
  }

  const row = await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      title: input.title,
      durationMinutes: input.durationMinutes,
      quickAccess: input.quickAccess,
      notesEnabled: input.notesEnabled,
      status: input.status,
      inviteeUserIds: invitees,
      // A moved meeting pushes again at its new time.
      ...(input.startsAt ? { startsAt: input.startsAt, startNotifiedAt: null } : {})
    },
    select: meetingSummarySelect
  });

  if (isLive) await applyLiveSettingsChange(meeting, row);
  if (invitees && meeting.access === "INVITE_ONLY" && isLive) {
    const dropped = meeting.inviteeUserIds.filter((id) => !invitees.includes(id));
    if (dropped.length > 0) await removeMeetingParticipants(meeting, dropped, now);
  }
  if (meeting.seriesKey === PRODUCER_SERIES.seriesKey && meeting.occurrenceKey) {
    if (input.status === "CANCELED") {
      await queueMeetingInvites({ kind: "cancel", occurrenceKey: meeting.occurrenceKey, durationMinutes: row.durationMinutes });
    } else if (input.startsAt || input.durationMinutes) {
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
