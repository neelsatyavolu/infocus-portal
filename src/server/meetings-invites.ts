import type { MeetingInviteEmailView, MeetingInviteListResponse } from "@/src/lib/meetings/types";
import { prisma } from "@/src/lib/prisma";
import type { MeetingViewer } from "@/src/server/meetings-access";
import {
  SERIES_KEY,
  inviteSelect,
  queueMeetingInvites,
  sendSeriesInvite,
  sendSeriesRemoval,
  type InviteRow
} from "@/src/server/meetings-invite-mail";
import { meetingPeopleByIds, producerUserIds } from "@/src/server/meetings-people";
import { isMeetingExec } from "@/src/server/meetings-rules";

/**
 * The calendar invite list (email addresses, optionally linked to a producer). Execs manage it;
 * every producer can read it. Sends never block the action that triggered them.
 */

/** Adding an address that was just invited doesn't email it again. */
export const REINVITE_COOLDOWN_MS = 10 * 60 * 1000;

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
  const names = await namesFor(rows);
  return { invites: rows.map((row) => toView(row, names)), canManage: isMeetingExec(viewer.role) };
}

export async function addMeetingInvite(
  viewer: MeetingViewer,
  input: { email: string; name?: string; userId?: string | null },
  now = new Date()
) {
  requireExec(viewer);
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || null;
  const userId = await validateLinkedUser(input.userId);
  const existing = await prisma.meetingInviteEmail.findUnique({
    where: { seriesKey_email: { seriesKey: SERIES_KEY, email } },
    select: { lastInvitedAt: true }
  });
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
  const names = await namesFor([row]);
  const recentlyInvited =
    existing?.lastInvitedAt && now.getTime() - existing.lastInvitedAt.getTime() < REINVITE_COOLDOWN_MS;
  if (recentlyInvited) return { invite: toView(row, names), emailed: false };
  const result = await sendSeriesInvite([row], now).catch((error) => {
    console.error("Meeting invite send failed", error instanceof Error ? error.message : error);
    return { sent: 0, failed: 1 };
  });
  const updated = result.sent ? { ...row, lastInvitedAt: now } : row;
  return { invite: toView(updated, names), emailed: result.sent === 1 };
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
    return { invite: toView(row, await namesFor([row])) };
  } catch (error) {
    if (isUniqueConflict(error)) throw new Error(LINK_TAKEN);
    throw error;
  }
}

export async function removeMeetingInvite(viewer: MeetingViewer, inviteId: string, now = new Date()) {
  requireExec(viewer);
  const row = await prisma.meetingInviteEmail.findFirst({ where: { id: inviteId, seriesKey: SERIES_KEY }, select: inviteSelect });
  if (!row) throw new Error("NOT_FOUND");
  await prisma.meetingInviteEmail.delete({ where: { id: row.id } });
  const result = await sendSeriesRemoval(row, now).catch((error) => {
    console.error("Meeting invite cancel failed", error instanceof Error ? error.message : error);
    return { sent: 0, failed: 1 };
  });
  return { removed: true, emailed: result.sent === 1 };
}

/** Queues the resend to every address (Inngest), so the request returns right away. */
export async function sendAllMeetingInvites(viewer: MeetingViewer) {
  requireExec(viewer);
  const recipients = await prisma.meetingInviteEmail.count({ where: { seriesKey: SERIES_KEY } });
  if (recipients === 0) return { queued: false, recipients };
  return { queued: await queueMeetingInvites({ kind: "series" }), recipients };
}
