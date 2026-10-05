import {
  AGENDA_MAX_ITEMS,
  isSameIdSet,
  renumber,
  type MeetingAgendaItemView,
  type MeetingAgendaResponse
} from "@/src/lib/meetings/agenda";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";
import { assertCanSeeMeeting, type MeetingViewer } from "@/src/server/meetings-access";
import { sendMeetingRoomEvent } from "@/src/server/meetings-room-client";
import { isMeetingOpen } from "@/src/server/meetings-rules";

/**
 * Meeting agendas. Any producer who can see the meeting may read and edit it (hidden meetings
 * answer 404). ENDED and CANCELED agendas are read-only. Changes to a LIVE meeting are pushed to
 * the call as an `agenda` room event so everyone refetches.
 */

export const AGENDA_READ_ONLY_MESSAGE = "This meeting is over, so its agenda can't be changed.";

const meetingSelect = { id: true, status: true, access: true, createdById: true, inviteeUserIds: true } as const;

async function loadMeeting(viewer: MeetingViewer, meetingId: string) {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: meetingSelect });
  assertCanSeeMeeting(viewer, meeting);
  return meeting;
}

async function loadEditableMeeting(viewer: MeetingViewer, meetingId: string) {
  const meeting = await loadMeeting(viewer, meetingId);
  if (!isMeetingOpen(meeting.status)) throw new Error(AGENDA_READ_ONLY_MESSAGE);
  return meeting;
}

async function readAgenda(meeting: { id: string; status: Parameters<typeof isMeetingOpen>[0] }): Promise<MeetingAgendaResponse> {
  const rows = await prisma.meetingAgendaItem.findMany({
    where: { meetingId: meeting.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, text: true, position: true, done: true, doneAt: true, doneById: true }
  });
  const doneByIds = [...new Set(rows.map((r) => r.doneById).filter((id): id is string => Boolean(id)))];
  const users = doneByIds.length
    ? await prisma.user.findMany({ where: { id: { in: doneByIds } }, select: { id: true, name: true, nickname: true, email: true } })
    : [];
  const names = new Map(users.map((u) => [u.id, userDisplayName(u, "Producer")]));
  const items: MeetingAgendaItemView[] = rows.map((row, position) => ({
    id: row.id,
    text: row.text,
    position,
    done: row.done,
    doneAt: row.doneAt?.toISOString() ?? null,
    doneByName: row.doneById ? (names.get(row.doneById) ?? "Producer") : null
  }));
  return { items, readOnly: !isMeetingOpen(meeting.status) };
}

async function changed(meeting: { id: string; status: string }) {
  if (meeting.status === "LIVE") await sendMeetingRoomEvent(meeting.id, { t: "agenda", version: Date.now() });
}

export async function getAgenda(viewer: MeetingViewer, meetingId: string) {
  return readAgenda(await loadMeeting(viewer, meetingId));
}

export async function addAgendaItem(viewer: MeetingViewer, meetingId: string, text: string) {
  const meeting = await loadEditableMeeting(viewer, meetingId);
  await prisma.$transaction(async (tx) => {
    const count = await tx.meetingAgendaItem.count({ where: { meetingId } });
    if (count >= AGENDA_MAX_ITEMS) throw new Error(`An agenda can have up to ${AGENDA_MAX_ITEMS} items.`);
    await tx.meetingAgendaItem.create({ data: { meetingId, text, position: count, createdById: viewer.userId } });
  });
  await changed(meeting);
  return readAgenda(meeting);
}

async function loadItem(meetingId: string, itemId: string) {
  const item = await prisma.meetingAgendaItem.findUnique({ where: { id: itemId }, select: { id: true, meetingId: true } });
  if (!item || item.meetingId !== meetingId) throw new Error("NOT_FOUND");
  return item;
}

export async function updateAgendaItem(
  viewer: MeetingViewer,
  meetingId: string,
  itemId: string,
  patch: { text?: string; done?: boolean },
  now = new Date()
) {
  const meeting = await loadEditableMeeting(viewer, meetingId);
  await loadItem(meetingId, itemId);
  await prisma.meetingAgendaItem.update({
    where: { id: itemId },
    data: {
      ...(patch.text !== undefined ? { text: patch.text } : {}),
      ...(patch.done !== undefined
        ? { done: patch.done, doneAt: patch.done ? now : null, doneById: patch.done ? viewer.userId : null }
        : {})
    }
  });
  await changed(meeting);
  return readAgenda(meeting);
}

export async function deleteAgendaItem(viewer: MeetingViewer, meetingId: string, itemId: string) {
  const meeting = await loadEditableMeeting(viewer, meetingId);
  await loadItem(meetingId, itemId);
  await prisma.$transaction(async (tx) => {
    await tx.meetingAgendaItem.delete({ where: { id: itemId } });
    const rest = await tx.meetingAgendaItem.findMany({
      where: { meetingId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true }
    });
    for (const { id, position } of renumber(rest.map((r) => r.id))) {
      await tx.meetingAgendaItem.update({ where: { id }, data: { position } });
    }
  });
  await changed(meeting);
  return readAgenda(meeting);
}

/** Reorders to exactly `itemIds` (must be this meeting's full set) and renumbers 0..n-1. */
export async function reorderAgenda(viewer: MeetingViewer, meetingId: string, itemIds: string[]) {
  const meeting = await loadEditableMeeting(viewer, meetingId);
  await prisma.$transaction(async (tx) => {
    const current = await tx.meetingAgendaItem.findMany({ where: { meetingId }, select: { id: true } });
    if (!isSameIdSet(current.map((r) => r.id), itemIds)) {
      throw new Error("The agenda changed while you were reordering. Reload and try again.");
    }
    for (const { id, position } of renumber(itemIds)) {
      await tx.meetingAgendaItem.update({ where: { id }, data: { position } });
    }
  });
  await changed(meeting);
  return readAgenda(meeting);
}
