import type { MeetingAccess, MeetingParticipantState, MeetingStatus, PlatformRole } from "@prisma/client";
import { hasPlatformRole } from "@/src/lib/platform-admin";

/** Pure meeting access rules (no I/O), shared by the routes and the tests. */

export type MeetingAccessFields = {
  access: MeetingAccess;
  createdById: string | null;
  inviteeUserIds: string[];
};

type Viewer = { userId: string; role: PlatformRole | null };

/** Meetings tab and calls: every producer (associate producer and up). */
export function isMeetingProducer(role: PlatformRole | null) {
  return hasPlatformRole(role, "ASSOCIATE_PRODUCER");
}

/** EP, adviser and super admin host every OPEN meeting and may create INVITE_ONLY ones. */
export function isMeetingExec(role: PlatformRole | null) {
  return hasPlatformRole(role, "EXECUTIVE_PRODUCER");
}

function isCreator(viewer: Viewer, meeting: { createdById: string | null }) {
  return Boolean(meeting.createdById) && meeting.createdById === viewer.userId;
}

/**
 * OPEN: every producer. INVITE_ONLY: only the creator and the invitees; execs who are not
 * invited get nothing (callers answer 404 so the meeting's existence doesn't leak).
 */
export function canSeeMeeting(viewer: Viewer, meeting: MeetingAccessFields) {
  if (meeting.access === "OPEN") return true;
  return isCreator(viewer, meeting) || meeting.inviteeUserIds.includes(viewer.userId);
}

/** OPEN: execs and the creator. INVITE_ONLY: the creator and invited execs. */
export function isMeetingHost(viewer: Viewer, meeting: MeetingAccessFields) {
  if (isCreator(viewer, meeting)) return true;
  if (!isMeetingExec(viewer.role)) return false;
  return meeting.access === "OPEN" || meeting.inviteeUserIds.includes(viewer.userId);
}

/** Moves, cancels and settings changes are possible until the meeting is over. */
export function isMeetingOpen(status: MeetingStatus) {
  return status === "SCHEDULED" || status === "LIVE";
}

/**
 * State after a /join:
 * - hosts are always let in;
 * - someone already admitted stays admitted (rejoin, refresh, second device);
 * - quick access lets a new or waiting producer in;
 * - a non-host never leaves DENIED or REMOVED for ADMITTED on their own: they knock again (WAITING).
 */
export function decideAdmission(input: {
  isHost: boolean;
  quickAccess: boolean;
  previous: MeetingParticipantState | null;
}): "WAITING" | "ADMITTED" {
  if (input.isHost) return "ADMITTED";
  if (input.previous === "ADMITTED") return "ADMITTED";
  if (input.quickAccess && (input.previous === null || input.previous === "WAITING")) return "ADMITTED";
  return "WAITING";
}
