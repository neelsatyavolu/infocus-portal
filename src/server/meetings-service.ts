import { timingSafeEqual } from "node:crypto";
import type { MeetingRoomReport } from "@/src/lib/meetings/protocol";
import { verifyMeetingInternalToken } from "@/src/lib/meetings/room-token";
import { prisma } from "@/src/lib/prisma";
import { markMeetingLive } from "@/src/server/meetings-join";
import { endMeeting } from "@/src/server/meetings-moderation";
import { notifyMeetingKnock } from "@/src/server/meetings-notify";

/** Server-to-server Meetings endpoints: room reports from the Worker, notes updates from the Drive. */

function bearer(request: Request) {
  const auth = request.headers.get("authorization") || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

/** "unconfigured" (503), "denied" (401) or "ok". */
export async function checkRoomCaller(request: Request, meetingId: string) {
  const secret = process.env.MEETING_ROOM_SECRET?.trim();
  if (!secret) return "unconfigured" as const;
  const payload = await verifyMeetingInternalToken(bearer(request), secret, "room", meetingId);
  return payload ? ("ok" as const) : ("denied" as const);
}

/** Drive service token, compared in constant time (same as /api/service/drive-roster). */
export function checkDriveCaller(request: Request) {
  const expected = (process.env.DRIVE_SERVICE_TOKEN || "").trim();
  if (!expected) return "unconfigured" as const;
  const given = Buffer.from(bearer(request));
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want) ? ("ok" as const) : ("denied" as const);
}

export async function handleMeetingRoomReport(meetingId: string, report: MeetingRoomReport) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, title: true, access: true, createdById: true, inviteeUserIds: true }
  });
  if (!meeting) throw new Error("NOT_FOUND");

  if (report.t === "started") return { live: await markMeetingLive(meetingId) };
  if (report.t === "knock") return { pushed: await notifyMeetingKnock(meeting, { uid: report.uid, name: report.name }) };
  if (report.t === "hostPromoted") {
    // Only someone still admitted can be handed host (never the Scribe, never a removed person).
    const promoted = await prisma.meetingParticipant.updateMany({
      where: { meetingId, userId: report.uid, state: "ADMITTED" },
      data: { promotedHost: true }
    });
    return { promoted: promoted.count === 1 };
  }
  return endMeeting(meetingId, new Date(), "EMPTY");
}

export { applyMeetingNotesUpdate } from "@/src/server/meetings-notes";
