import type { MeetingInviteEmailView, MeetingInviteListResponse } from "@/src/lib/meetings/types";
import { prisma } from "@/src/lib/prisma";
import type { MeetingViewer } from "@/src/server/meetings-access";
import { PRODUCER_SERIES } from "@/src/lib/meetings/schedule";
import { meetingsCalendarStatus, queueMeetingCalendar } from "@/src/server/meetings-google-calendar";
import { meetingPeopleByIds, producerUserIds } from "@/src/server/meetings-people";
import { isMeetingExec } from "@/src/server/meetings-rules";

/**
 * The calendar invite list (email addresses, optionally linked to a producer). Execs manage it;
 * every producer can read it. Each change queues a Google Calendar sync: Google itself emails the
 * invite (added) or the cancellation (removed). The request never waits on Google.
 */

const SERIES_KEY = PRODUCER_SERIES.seriesKey;

type InviteRow = {
  id: string;
  email: string;
  name: string | null;
  userId: string | null;
  createdAt: Date;
  lastInvitedAt: Date | null;
};

const inviteSelect = { id: true, email: true, name: true, userId: true, createdAt: true, lastInvitedAt: true } as const;

function toView(row: InviteRow, names: Map<string, string>): MeetingInviteEmailView {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    userId: row.userId,
    userName: row.userId ? (names.get(row.userId) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
    lastInvitedAt: row.lastInvitedAt?.toISOString() ?? null
  };
}

async function namesFor(rows: InviteRow[]) {
  const ids = rows.flatMap((row) => (row.userId ? [row.userId] : []));
  return new Map((await meetingPeopleByIds(ids)).map((person) => [person.id, person.name]));
}

function requireExec(viewer: MeetingViewer) {
  if (!isMeetingExec(viewer.role)) throw new Error("FORBIDDEN");
}

async function validateLinkedUser(userId: string | null | undefined) {
  if (!userId) return null;
  if (!(await producerUserIds()).includes(userId)) throw new Error("That person isn't a producer.");
  return userId;
}

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

const LINK_TAKEN = "That producer already has an address on the list.";

export async function listMeetingInvites(viewer: MeetingViewer): Promise<MeetingInviteListResponse> {
  const rows = await prisma.meetingInviteEmail.findMany({
    where: { seriesKey: SERIES_KEY },
    orderBy: { email: "asc" },
    select: inviteSelect
  });
  const [names, status] = await Promise.all([namesFor(rows), meetingsCalendarStatus()]);
  return {
    invites: rows.map((row) => toView(row, names)),
    canManage: isMeetingExec(viewer.role),
    calendar: {
      connected: status.connected,
      accountEmail: status.accountEmail,
      lastSyncedAt: status.lastSyncedAt,
      lastSyncError: status.lastSyncError
    }
  };
}

export async function addMeetingInvite(
  viewer: MeetingViewer,
  input: { email: string; name?: string; userId?: string | null }
) {
  requireExec(viewer);
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || null;
  const userId = await validateLinkedUser(input.userId);
  let row: InviteRow;
  try {
    row = await prisma.meetingInviteEmail.upsert({
      where: { seriesKey_email: { seriesKey: SERIES_KEY, email } },
      create: { seriesKey: SERIES_KEY, email, name, userId, addedById: viewer.userId },
      update: { ...(name ? { name } : {}), ...(userId ? { userId } : {}) },
      select: inviteSelect
    });
  } catch (error) {
    if (isUniqueConflict(error)) throw new Error(LINK_TAKEN);
    throw error;
  }
  // Adds them to the series and to every upcoming event they qualify for (an unchanged address is a no-op).
  const queued = await queueMeetingCalendar({ kind: "sync" });
  return { invite: toView(row, await namesFor([row])), queued };
}

/** Exec only: link an address to a producer, or unlink it (null). */
export async function linkMeetingInvite(viewer: MeetingViewer, inviteId: string, userId: string | null) {
  requireExec(viewer);
  const existing = await prisma.meetingInviteEmail.findFirst({
    where: { id: inviteId, seriesKey: SERIES_KEY },
    select: { id: true }
  });
  if (!existing) throw new Error("NOT_FOUND");
  const linked = await validateLinkedUser(userId);
  try {
    const row = await prisma.meetingInviteEmail.update({
      where: { id: inviteId },
      data: { userId: linked },
      select: inviteSelect
    });
    // Linking can change who an invite-only meeting's event includes.
    await queueMeetingCalendar({ kind: "sync" });
    return { invite: toView(row, await namesFor([row])) };
  } catch (error) {
    if (isUniqueConflict(error)) throw new Error(LINK_TAKEN);
    throw error;
  }
}

export async function removeMeetingInvite(viewer: MeetingViewer, inviteId: string) {
  requireExec(viewer);
  const row = await prisma.meetingInviteEmail.findFirst({ where: { id: inviteId, seriesKey: SERIES_KEY }, select: inviteSelect });
  if (!row) throw new Error("NOT_FOUND");
  await prisma.meetingInviteEmail.delete({ where: { id: row.id } });
  // The sync drops them from every event; Google sends them the cancellation.
  return { removed: true, queued: await queueMeetingCalendar({ kind: "sync" }) };
}

/** "Sync now": queue a full Google Calendar reconcile (series guests, moved/cancelled slots, one-off events). */
export async function syncMeetingInvites(viewer: MeetingViewer) {
  requireExec(viewer);
  return { queued: await queueMeetingCalendar({ kind: "sync" }) };
}
