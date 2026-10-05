import type { TicketResponse } from "@/src/lib/meetings/types";
import { prisma } from "@/src/lib/prisma";
import { assertCanSeeMeeting, isMeetingHostOrPromoted, type MeetingViewer } from "@/src/server/meetings-access";
import { participantState, refuseBeforeJoinWindow } from "@/src/server/meetings-join";
import { ensureMeetingKey } from "@/src/server/meetings-keys";
import { isReopenable, reopenMeeting } from "@/src/server/meetings-reopen";
import { issueMeetingRoomTicket, meetingRoomSecret, meetingRoomUrl } from "@/src/server/meetings-room-client";
import { isMeetingExec } from "@/src/server/meetings-rules";

/**
 * A fresh room ticket for someone already admitted (ticket refresh, reconnects). Errors:
 * 401 signed out (route), 404 can't see the meeting, 410 ended/cancelled ("GONE"),
 * 403 not admitted or removed ("FORBIDDEN"). An EMPTY-ended meeting within 15 minutes is reopened.
 */

function loadTicketMeeting(meetingId: string) {
  return prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      status: true,
      startsAt: true,
      access: true,
      createdById: true,
      inviteeUserIds: true,
      endedReason: true,
      endedAt: true,
      roomGeneration: true
    }
  });
}

export async function issueRoomTicketForViewer(viewer: MeetingViewer, meetingId: string, now = new Date()): Promise<TicketResponse> {
  meetingRoomSecret();
  const roomUrl = meetingRoomUrl();
  let meeting = await loadTicketMeeting(meetingId);
  assertCanSeeMeeting(viewer, meeting);

  const admitted = (await participantState(meetingId, viewer.userId)) === "ADMITTED";
  if (admitted && isReopenable(meeting, now)) {
    await reopenMeeting(meetingId, now);
    meeting = (await loadTicketMeeting(meetingId)) ?? meeting;
  }
  if (meeting.status === "ENDED" || meeting.status === "CANCELED") throw new Error("GONE");
  if (!admitted) throw new Error("FORBIDDEN");
  refuseBeforeJoinWindow(meeting, now);

  const isHost = await isMeetingHostOrPromoted(viewer, meeting);
  const key = await ensureMeetingKey(meetingId);
  // Key first, state second: if a removal rotated the key we now hold, we also see REMOVED.
  if ((await participantState(meetingId, viewer.userId)) !== "ADMITTED") throw new Error("FORBIDDEN");

  const roomToken = await issueMeetingRoomTicket({
    meetingId,
    uid: viewer.userId,
    name: viewer.name,
    role: isHost ? "host" : "member",
    admitted: true,
    exec: isMeetingExec(viewer.role),
    gen: meeting.roomGeneration,
    now: now.getTime()
  });
  return { roomToken, roomUrl, key };
}
