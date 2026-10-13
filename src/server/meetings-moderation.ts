import type { MeetingEndReason } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { assertCanSeeMeeting, isMeetingHostOrPromoted, type MeetingViewer } from "@/src/server/meetings-access";
import { readMeetingKey, rotateMeetingKey } from "@/src/server/meetings-keys";
import { emailMeetingNotes } from "@/src/server/meetings-notes-email";
import { sendMeetingRoomEvent } from "@/src/server/meetings-room-client";
import { isMeetingOpen } from "@/src/server/meetings-rules";
import { rekeyMeetingScribe, stopMeetingScribe } from "@/src/server/meetings-scribe";

/** Host actions: admit, deny, remove, admit all, end for everyone. */

export type ParticipantAction = "admit" | "deny" | "remove";

async function requireHostOfOpenMeeting(viewer: MeetingViewer, meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, status: true, access: true, createdById: true, inviteeUserIds: true, notesEnabled: true }
  });
  assertCanSeeMeeting(viewer, meeting);
  if (!(await isMeetingHostOrPromoted(viewer, meeting))) throw new Error("FORBIDDEN");
  if (!isMeetingOpen(meeting.status)) throw new Error("This meeting is over.");
  return meeting;
}

export const ROOM_UPDATE_FAILED = "Removed, but the call didn't get the update — try again.";

/** removed / rekey / ended must reach the room: one retry, then report failure. */
async function sendCriticalRoomEvent(meetingId: string, event: Parameters<typeof sendMeetingRoomEvent>[1]) {
  if (await sendMeetingRoomEvent(meetingId, event)) return true;
  return sendMeetingRoomEvent(meetingId, event);
}

/**
 * Takes people out of a meeting: REMOVED (compare-and-set, so a concurrent join can't undo it),
 * then a new key when any of them had been let in, room events `removed` for each then `rekey`,
 * and the Scribe gets the new key. Calling it again for someone already REMOVED re-sends the same
 * events with their original removal time and the current key (idempotent retry after a failed send).
 * Returns the current epoch; throws ROOM_UPDATE_FAILED if the room still didn't get the events.
 */
export async function removeMeetingParticipants(
  meeting: { id: string; status: string; notesEnabled: boolean },
  userIds: string[],
  now = new Date()
) {
  const rows = await prisma.meetingParticipant.findMany({
    where: { meetingId: meeting.id, userId: { in: userIds } },
    select: { userId: true, state: true, removedAt: true }
  });
  if (rows.length === 0) return null;

  const fresh = rows.filter((row) => row.state !== "REMOVED");
  let revokedKeyHolder = false;
  for (const row of fresh) {
    const updated = await prisma.meetingParticipant.updateMany({
      where: { meetingId: meeting.id, userId: row.userId, state: row.state },
      data: { state: "REMOVED", removedAt: now, promotedHost: false }
    });
    // Lost a race: they changed state meanwhile. If they could have the key, rotate anyway.
    if (row.state === "ADMITTED" || updated.count === 0) revokedKeyHolder = true;
    if (updated.count === 0) {
      await prisma.meetingParticipant.updateMany({
        where: { meetingId: meeting.id, userId: row.userId },
        data: { state: "REMOVED", removedAt: now, promotedHost: false }
      });
    }
  }
  const retrying = rows.length > fresh.length;

  // New key first, so the removed people's last ticket and key are both dead.
  const key = revokedKeyHolder ? await rotateMeetingKey(meeting.id) : retrying ? await currentKey(meeting.id) : null;

  let delivered = true;
  for (const row of rows) {
    const at = (row.state === "REMOVED" && row.removedAt ? row.removedAt : now).getTime();
    delivered = (await sendCriticalRoomEvent(meeting.id, { t: "removed", uid: row.userId, at })) && delivered;
  }
  if (key) {
    delivered = (await sendCriticalRoomEvent(meeting.id, { t: "rekey", epoch: key.epoch })) && delivered;
    if (meeting.notesEnabled && meeting.status === "LIVE") await rekeyMeetingScribe(meeting.id, key);
  }
  if (!delivered) throw new Error(ROOM_UPDATE_FAILED);
  return key?.epoch ?? null;
}

async function currentKey(meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { keyCiphertext: true, keyEpoch: true }
  });
  return meeting ? readMeetingKey(meeting) : null;
}

export async function actOnParticipant(
  viewer: MeetingViewer,
  meetingId: string,
  userId: string,
  action: ParticipantAction,
  now = new Date()
) {
  const meeting = await requireHostOfOpenMeeting(viewer, meetingId);
  if (action !== "admit" && userId === viewer.userId) throw new Error("Use Leave to leave the meeting.");
  const participant = await prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId, userId } },
    select: { state: true }
  });
  if (!participant) throw new Error("NOT_FOUND");

  if (action === "admit") {
    if (participant.state !== "ADMITTED") {
      const updated = await prisma.meetingParticipant.updateMany({
        where: { meetingId, userId, state: { in: ["WAITING", "DENIED"] } },
        data: { state: "ADMITTED" }
      });
      if (updated.count === 0) throw new Error("They aren't waiting to join. Ask them to join again.");
    }
    // Sent again for someone already admitted: if the first event was lost they'd sit in the lobby
    // forever (the room only lets them in on this event), so a second Admit click must re-send it.
    if (!(await sendMeetingRoomEvent(meetingId, { t: "admitted", uid: userId }))) {
      throw new Error("Couldn't reach the call to let them in. Admit again.");
    }
    return { state: "ADMITTED" as const };
  }

  // Denying someone already in the call would leave them with the key: that is a removal.
  if (action === "deny" && participant.state !== "ADMITTED") {
    const updated = await prisma.meetingParticipant.updateMany({
      where: { meetingId, userId, state: "WAITING" },
      data: { state: "DENIED" }
    });
    if (updated.count === 0) {
      const latest = await prisma.meetingParticipant.findUnique({
        where: { meetingId_userId: { meetingId, userId } },
        select: { state: true }
      });
      if (latest?.state === "ADMITTED") return removeOne(meeting, userId, now);
      throw new Error("They aren't waiting to join.");
    }
    await sendMeetingRoomEvent(meetingId, { t: "denied", uid: userId });
    return { state: "DENIED" as const };
  }

  return removeOne(meeting, userId, now);
}

async function removeOne(meeting: { id: string; status: string; notesEnabled: boolean }, userId: string, now: Date) {
  const epoch = await removeMeetingParticipants(meeting, [userId], now);
  return { state: "REMOVED" as const, ...(epoch !== null ? { epoch } : {}) };
}

export async function admitAllWaiting(viewer: MeetingViewer, meetingId: string) {
  await requireHostOfOpenMeeting(viewer, meetingId);
  const waiting = await prisma.meetingParticipant.findMany({
    where: { meetingId, state: "WAITING" },
    select: { userId: true }
  });
  if (waiting.length === 0) return { admitted: 0 };
  const userIds = waiting.map((entry) => entry.userId);
  await prisma.meetingParticipant.updateMany({
    where: { meetingId, state: "WAITING", userId: { in: userIds } },
    data: { state: "ADMITTED" }
  });
  await Promise.all(userIds.map((uid) => sendMeetingRoomEvent(meetingId, { t: "admitted", uid })));
  return { admitted: userIds.length };
}

/**
 * Ends the meeting: a host (HOST, final), the room after it sat empty (EMPTY, reopenable for 15
 * minutes), or the stale-meeting cron (STALE, final). Idempotent: ending an ended meeting re-sends
 * `ended` to the room (it may have missed it), and a host's End makes an EMPTY end final.
 */
export async function endMeeting(meetingId: string, now = new Date(), reason: MeetingEndReason = "HOST") {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { status: true, notesEnabled: true, notesStatus: true, endedReason: true }
  });
  if (!meeting) throw new Error("NOT_FOUND");
  const ended = await prisma.meeting.updateMany({
    where: { id: meetingId, status: { in: ["SCHEDULED", "LIVE"] } },
    data: { status: "ENDED", endedAt: now, endedReason: reason, keyCiphertext: null }
  });
  if (ended.count === 0) {
    if (meeting.status === "ENDED") {
      if (reason === "HOST" && meeting.endedReason === "EMPTY") {
        await prisma.meeting.updateMany({ where: { id: meetingId, status: "ENDED", endedReason: "EMPTY" }, data: { endedReason: "HOST" } });
      }
      await sendCriticalRoomEvent(meetingId, { t: "ended" });
    }
    return { ended: false };
  }

  await sendCriticalRoomEvent(meetingId, { t: "ended" });
  // Stopping makes the Scribe process the notes.
  if (meeting.status === "LIVE" && meeting.notesEnabled) await stopMeetingScribe(meetingId);
  // Notes that became READY while the call was still live never get a later callback.
  if (meeting.notesStatus === "READY") await emailMeetingNotes(meetingId);
  return { ended: true };
}

/** End for everyone. On a meeting that already ended (e.g. it sat empty), it re-sends `ended` and makes that final. */
export async function endMeetingAsHost(viewer: MeetingViewer, meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, status: true, access: true, createdById: true, inviteeUserIds: true }
  });
  assertCanSeeMeeting(viewer, meeting);
  if (!(await isMeetingHostOrPromoted(viewer, meeting))) throw new Error("FORBIDDEN");
  if (meeting.status === "CANCELED") throw new Error("This meeting is over.");
  return endMeeting(meetingId, new Date(), "HOST");
}
