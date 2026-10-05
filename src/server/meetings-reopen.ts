import type { MeetingEndReason, MeetingStatus } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { readMeetingKey, sealedNewMeetingKey } from "@/src/server/meetings-keys";
import { sendMeetingRoomEvent } from "@/src/server/meetings-room-client";
import { startMeetingScribe } from "@/src/server/meetings-scribe";

/**
 * A meeting that ended because everyone left (EMPTY) can be picked up again for 15 minutes: the
 * next admitted /join or /ticket reopens it. A host's End for everyone (HOST) and the stale-meeting
 * cron (STALE) are final.
 */

export const REOPEN_WINDOW_MS = 15 * 60 * 1000;

export function isReopenable(
  meeting: { status: MeetingStatus; endedReason: MeetingEndReason | null; endedAt: Date | null },
  now: Date
) {
  return (
    meeting.status === "ENDED" &&
    meeting.endedReason === "EMPTY" &&
    meeting.endedAt !== null &&
    now.getTime() - meeting.endedAt.getTime() <= REOPEN_WINDOW_MS
  );
}

/**
 * EMPTY-ended → LIVE again, with a fresh key (epoch + 1) and the next room generation, so the
 * room starts a new run and every ticket of the ended one stays dead. Race-safe: only one caller
 * flips it. Restarts the notes if they're on (a new notes session). Returns whether this call reopened it.
 */
export async function reopenMeeting(meetingId: string, now = new Date()) {
  const reopened = await prisma.meeting.updateMany({
    where: {
      id: meetingId,
      status: "ENDED",
      endedReason: "EMPTY",
      endedAt: { gte: new Date(now.getTime() - REOPEN_WINDOW_MS) }
    },
    data: {
      status: "LIVE",
      endedAt: null,
      endedReason: null,
      roomGeneration: { increment: 1 },
      keyCiphertext: sealedNewMeetingKey(),
      keyEpoch: { increment: 1 }
    }
  });
  if (reopened.count === 0) return false;

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, title: true, startsAt: true, notesEnabled: true, keyCiphertext: true, keyEpoch: true, roomGeneration: true }
  });
  const key = meeting ? readMeetingKey(meeting) : null;
  console.log(JSON.stringify({ evt: "meeting_reopened", mid: meetingId, generation: meeting?.roomGeneration ?? null }));
  if (!meeting || !key) return true;
  // The room learns the new epoch; its first ticket of the new generation starts the fresh run.
  await sendMeetingRoomEvent(meetingId, { t: "rekey", epoch: key.epoch });
  if (meeting.notesEnabled) await startMeetingScribe(meeting, key);
  return true;
}
