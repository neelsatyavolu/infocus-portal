import { timingSafeEqual } from "node:crypto";
import type { MeetingNotesStatus } from "@prisma/client";
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
  return endMeeting(meetingId);
}

export async function applyMeetingNotesUpdate(
  meetingId: string,
  input: { status: MeetingNotesStatus; summaryMarkdown?: string; drivePath?: string }
) {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { id: true } });
  if (!meeting) throw new Error("NOT_FOUND");
  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      notesStatus: input.status,
      ...(input.summaryMarkdown !== undefined ? { notesSummary: input.summaryMarkdown } : {}),
      ...(input.drivePath !== undefined ? { notesDrivePath: input.drivePath } : {})
    }
  });
  return { notesStatus: input.status };
}
