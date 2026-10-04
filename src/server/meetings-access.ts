import type { PlatformRole, Prisma } from "@prisma/client";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { meetingJoinOpensAt } from "@/src/lib/meetings/schedule";
import type { MeetingDetail, MeetingPerson, MeetingSummary } from "@/src/lib/meetings/types";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";
import {
  canSeeMeeting,
  isMeetingExec,
  isMeetingHost,
  isMeetingOpen,
  isMeetingProducer,
  type MeetingAccessFields
} from "@/src/server/meetings-rules";

/** Signed-in producer for the Meetings routes, plus the DTO mapping every route shares. */

export type MeetingViewer = { userId: string; name: string; role: PlatformRole | null };

export async function requireMeetingViewer(): Promise<MeetingViewer> {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  if (!isMeetingProducer(access.role)) throw new Error("FORBIDDEN");
  return { userId: user.id, name: userDisplayName(user, "Producer"), role: access.role };
}

/**
 * Host for Portal actions (admit, deny, remove, end, settings, join as host): the static hosts
 * (isMeetingHost), plus anyone the room handed host to after the last host left (`promotedHost`,
 * while they are still admitted). The original host stays a host too.
 */
export async function isMeetingHostOrPromoted(
  viewer: MeetingViewer,
  meeting: MeetingAccessFields & { id: string }
): Promise<boolean> {
  if (isMeetingHost(viewer, meeting)) return true;
  const row = await prisma.meetingParticipant.findUnique({
    where: { meetingId_userId: { meetingId: meeting.id, userId: viewer.userId } },
    select: { promotedHost: true, state: true }
  });
  return Boolean(row?.promotedHost && row.state === "ADMITTED");
}

/** INVITE_ONLY / EXECS_ONLY meetings the viewer isn't allowed in look exactly like missing ones. */
export function assertCanSeeMeeting(viewer: MeetingViewer, meeting: MeetingAccessFields | null): asserts meeting {
  if (!meeting || !canSeeMeeting(viewer, meeting)) throw new Error("NOT_FOUND");
}

/** Prisma filter matching canSeeMeeting(), for lists. */
export function visibleMeetingWhere(viewer: MeetingViewer): Prisma.MeetingWhereInput {
  return {
    OR: [
      { access: "OPEN" },
      { access: "INVITE_ONLY", OR: [{ createdById: viewer.userId }, { inviteeUserIds: { has: viewer.userId } }] },
      ...(isMeetingExec(viewer.role) ? [{ access: "EXECS_ONLY" as const }] : [])
    ]
  };
}

export const meetingSummarySelect = {
  id: true,
  title: true,
  startsAt: true,
  durationMinutes: true,
  status: true,
  access: true,
  inviteeUserIds: true,
  seriesKey: true,
  createdById: true,
  notesEnabled: true,
  quickAccess: true,
  notesStatus: true,
  createdBy: { select: { name: true, nickname: true, email: true } },
  // Attendees: everyone who was let in, including anyone later removed.
  _count: { select: { participants: { where: { state: { in: ["ADMITTED", "REMOVED"] } } } } }
} satisfies Prisma.MeetingSelect;

export const meetingDetailSelect = {
  ...meetingSummarySelect,
  notesSummary: true,
  notesDrivePath: true,
  startedAt: true,
  endedAt: true
} satisfies Prisma.MeetingSelect;

export type MeetingSummaryRow = Prisma.MeetingGetPayload<{ select: typeof meetingSummarySelect }>;
export type MeetingDetailRow = Prisma.MeetingGetPayload<{ select: typeof meetingDetailSelect }>;

export function toMeetingSummary(row: MeetingSummaryRow, viewer: MeetingViewer): MeetingSummary {
  const isHost = isMeetingHost(viewer, row);
  return {
    id: row.id,
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    joinOpensAt: meetingJoinOpensAt(row.startsAt).toISOString(),
    durationMinutes: row.durationMinutes,
    status: row.status,
    access: row.access,
    inviteeCount: row.inviteeUserIds.length,
    seriesKey: row.seriesKey,
    isHost,
    canEdit: isHost && isMeetingOpen(row.status),
    notesEnabled: row.notesEnabled,
    quickAccess: row.quickAccess,
    notesStatus: row.notesStatus,
    participantCount: row._count.participants,
    createdByName: row.createdBy ? userDisplayName(row.createdBy) || null : null
  };
}

export function toMeetingDetail(
  row: MeetingDetailRow,
  viewer: MeetingViewer,
  invitees: MeetingPerson[]
): MeetingDetail {
  return {
    ...toMeetingSummary(row, viewer),
    notesSummary: row.notesSummary,
    invitees,
    hasTranscript: row.notesStatus === "READY" && Boolean(row.notesDrivePath),
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null
  };
}
