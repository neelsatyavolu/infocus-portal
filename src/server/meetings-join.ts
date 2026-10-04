import { meetingJoinOpensAt, pacificOpensLabel } from "@/src/lib/meetings/schedule";
import type { JoinResponse, KeyResponse, MeetingSummary } from "@/src/lib/meetings/types";
import { prisma } from "@/src/lib/prisma";
import {
  assertCanSeeMeeting,
  isMeetingHostOrPromoted,
  meetingSummarySelect,
  toMeetingSummary,
  type MeetingViewer
} from "@/src/server/meetings-access";
import { ensureMeetingKey, readMeetingKey } from "@/src/server/meetings-keys";
import { issueMeetingRoomTicket, meetingRoomSecret, meetingRoomUrl } from "@/src/server/meetings-room-client";
import { decideAdmission, isMeetingExec, isMeetingHost, isMeetingOpen } from "@/src/server/meetings-rules";
import { startMeetingScribe } from "@/src/server/meetings-scribe";
import { MEETING_USAGE_LIMIT_MESSAGE, checkMeetingUsage } from "@/src/server/meetings-usage";

/** Join (admission + room ticket + key), key fetch, and going LIVE. */

/** Scheduled meetings open 5 minutes early, for everyone (hosts too). LIVE meetings are always open. */
export function refuseBeforeJoinWindow(meeting: { status: string; startsAt: Date }, now: Date) {
  if (meeting.status !== "SCHEDULED") return;
  const opensAt = meetingJoinOpensAt(meeting.startsAt);
  if (now.getTime() < opensAt.getTime()) {
    throw new Error(`This meeting opens at ${pacificOpensLabel(opensAt, now)}.`);
  }
}

function refuseClosed(status: string) {
  if (status === "ENDED") throw new Error("This meeting has ended.");
  if (status === "CANCELED") throw new Error("This meeting was cancelled.");
}

/**
 * SCHEDULED → LIVE once. Starts the Scribe when notes are on. Returns whether this call flipped it.
 * Used by the first admitted /join and by the room's `started` report.
 */
export async function markMeetingLive(meetingId: string, now = new Date()) {
  const flipped = await prisma.meeting.updateMany({
    where: { id: meetingId, status: "SCHEDULED" },
    data: { status: "LIVE", startedAt: now }
  });
  if (flipped.count === 0) return false;

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, title: true, startsAt: true, notesEnabled: true }
  });
  if (meeting?.notesEnabled) {
    await startMeetingScribe(meeting, await ensureMeetingKey(meetingId));
  }
  return true;
}

const MAX_JOIN_ATTEMPTS = 3;
export const REMOVED_WHILE_JOINING = "A host removed you from this meeting. Join again to ask to be let back in.";

async function participantState(meetingId: string, userId: string) {
  const row = await prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
    select: { state: true }
  });
  return row?.state ?? null;
}

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/**
 * Compare-and-set participant transition for /join: the row only changes if it still holds the
 * state we decided from, so a concurrent removal or denial is never overwritten. Retries on a lost
 * race (re-reading the new state), and refuses after MAX_JOIN_ATTEMPTS.
 */
export async function admitOrQueue(input: {
  meetingId: string;
  userId: string;
  isHost: boolean;
  quickAccess: boolean;
  now: Date;
  beforeAdmit?: () => Promise<void>;
}): Promise<"WAITING" | "ADMITTED"> {
  const { meetingId, userId, now } = input;
  let metered = false;
  for (let attempt = 0; attempt < MAX_JOIN_ATTEMPTS; attempt += 1) {
    const previous = await participantState(meetingId, userId);
    const state = decideAdmission({ isHost: input.isHost, quickAccess: input.quickAccess, previous });
    if (state === "ADMITTED" && !metered) {
      await input.beforeAdmit?.();
      metered = true;
    }

    if (previous === null) {
      try {
        await prisma.meetingParticipant.create({
          data: { meetingId, userId, state, firstJoinedAt: now, lastJoinedAt: now }
        });
        return state;
      } catch (error) {
        if (isUniqueConflict(error)) continue;
        throw error;
      }
    }

    const updated = await prisma.meetingParticipant.updateMany({
      where: { meetingId, userId, state: previous },
      data: { state, lastJoinedAt: now }
    });
    if (updated.count === 1) return state;
  }
  throw new Error("CONFLICT");
}

/** A promoted host sees host controls in the call (the summary's static check doesn't know about promotion). */
function withHost(summary: MeetingSummary, isHost: boolean): MeetingSummary {
  return isHost && !summary.isHost ? { ...summary, isHost: true, canEdit: isMeetingOpen(summary.status) } : summary;
}

export async function joinMeeting(viewer: MeetingViewer, meetingId: string, now = new Date()): Promise<JoinResponse> {
  // Fail before touching anything when the room is not configured.
  meetingRoomSecret();
  const roomUrl = meetingRoomUrl();

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      status: true,
      startsAt: true,
      access: true,
      createdById: true,
      inviteeUserIds: true,
      quickAccess: true
    }
  });
  assertCanSeeMeeting(viewer, meeting);
  refuseClosed(meeting.status);
  refuseBeforeJoinWindow(meeting, now);

  // Static hosts are always let in; a promoted host (handed host in the room) also joins as host.
  const isStaticHost = isMeetingHost(viewer, meeting);
  const isHost = isStaticHost || (await isMeetingHostOrPromoted(viewer, meeting));
  const state = await admitOrQueue({
    meetingId,
    userId: viewer.userId,
    isHost,
    quickAccess: meeting.quickAccess,
    now,
    // Only a join that would take the meeting LIVE is metered.
    beforeAdmit: async () => {
      if (meeting.status === "SCHEDULED" && (await checkMeetingUsage(now)) === "over") {
        throw new Error(MEETING_USAGE_LIMIT_MESSAGE);
      }
    }
  });

  let key: KeyResponse | undefined;
  if (state === "ADMITTED") {
    key = await ensureMeetingKey(meetingId);
    // A removal that lands after our write rotates the key after marking REMOVED. Reading the key
    // first and the state second means: if we hold the new key, we also see REMOVED.
    if (!isStaticHost && (await participantState(meetingId, viewer.userId)) !== "ADMITTED") {
      throw new Error(REMOVED_WHILE_JOINING);
    }
    await markMeetingLive(meetingId, now);
  }

  const [roomToken, row] = await Promise.all([
    issueMeetingRoomTicket({
      meetingId,
      uid: viewer.userId,
      name: viewer.name,
      role: isHost ? "host" : "member",
      admitted: state === "ADMITTED",
      exec: isMeetingExec(viewer.role),
      now: now.getTime()
    }),
    prisma.meeting.findUniqueOrThrow({ where: { id: meetingId }, select: meetingSummarySelect })
  ]);

  return {
    roomUrl,
    roomToken,
    state,
    isHost,
    meeting: withHost(toMeetingSummary(row, viewer), isHost),
    ...(key ? { key } : {}),
    self: { uid: viewer.userId, name: viewer.name }
  };
}

/** Only admitted participants of a meeting that is not over get the key. */
export async function getMeetingKeyForViewer(viewer: MeetingViewer, meetingId: string): Promise<KeyResponse> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { status: true, access: true, createdById: true, inviteeUserIds: true, keyCiphertext: true, keyEpoch: true }
  });
  assertCanSeeMeeting(viewer, meeting);
  const participant = await prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId, userId: viewer.userId } },
    select: { state: true }
  });
  if (participant?.state !== "ADMITTED") throw new Error("FORBIDDEN");
  refuseClosed(meeting.status);
  const key = readMeetingKey(meeting);
  if (!key) throw new Error("NOT_FOUND");
  return key;
}
