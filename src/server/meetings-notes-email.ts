import type { MeetingNotesStatus } from "@prisma/client";
import { sendBrandedEmails } from "@/src/lib/email";
import { meetingNotesUrl } from "@/src/lib/meetings/links";
import { notesEmailHtml } from "@/src/lib/meetings/notes-markdown";
import { MEETINGS_TIME_ZONE, PRODUCER_SERIES } from "@/src/lib/meetings/schedule";
import { prisma } from "@/src/lib/prisma";
import { producerUserIds } from "@/src/server/meetings-people";

/**
 * "Meeting notes are ready" email, sent once the meeting has ended and its notes are READY.
 * The InFocus Producer Meeting goes to every producer, whether they came or not. Any other
 * meeting goes only to the people who were in it (let in and not removed). People who turned
 * email off in Settings are skipped; a notification email in Settings is used when set.
 */

type NotesBefore = { status: string; notesStatus: MeetingNotesStatus; notesDrivePaths: string[] };
type NotesChange = { notesSummary?: string; notesDrivePaths?: string[] };

/**
 * Email when a READY callback arrives after the meeting ended and brings a summary that is new:
 * the first READY, or a new part. A repeated READY for the same part (the Drive retrying) doesn't.
 */
export function shouldEmailNotes(before: NotesBefore, status: MeetingNotesStatus, change: NotesChange) {
  if (status !== "READY" || before.status !== "ENDED" || change.notesSummary === undefined) return false;
  const newPart = (change.notesDrivePaths?.length ?? before.notesDrivePaths.length) > before.notesDrivePaths.length;
  return before.notesStatus !== "READY" || newPart;
}

export async function meetingNotesRecipientIds(meeting: { id: string; seriesKey: string | null }) {
  if (meeting.seriesKey === PRODUCER_SERIES.seriesKey) return producerUserIds();
  const attended = await prisma.meetingParticipant.findMany({
    where: { meetingId: meeting.id, state: "ADMITTED" },
    select: { userId: true }
  });
  return attended.map((row) => row.userId);
}

async function recipientEmails(userIds: string[]) {
  if (userIds.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(userIds)] } },
    select: { email: true, notificationPreference: { select: { emailEnabled: true, notificationEmail: true } } }
  });
  return users
    .filter((user) => user.notificationPreference?.emailEnabled !== false)
    .map((user) => (user.notificationPreference?.notificationEmail ?? user.email)?.trim())
    .filter((email): email is string => Boolean(email));
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: MEETINGS_TIME_ZONE,
  weekday: "long",
  month: "short",
  day: "numeric"
});

/** Never throws: a failed email must not fail the Drive's notes callback. */
export async function emailMeetingNotes(meetingId: string) {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, title: true, startsAt: true, seriesKey: true, notesSummary: true, notesDrivePaths: true }
    });
    if (!meeting?.notesSummary?.trim()) return;
    const recipients = await recipientEmails(await meetingNotesRecipientIds(meeting));
    if (recipients.length === 0) return;
    const day = dateFormat.format(meeting.startsAt);
    const result = await sendBrandedEmails({
      recipients,
      subject: `Notes: ${meeting.title} · ${day}`,
      heading: `${meeting.title} notes`,
      paragraphs: [`The notes from ${day}'s ${meeting.title} are ready. The summary is below; the full transcript is on the notes page.`],
      extraHtml: notesEmailHtml(meeting.notesSummary),
      ctaLabel: "Open notes and transcript",
      ctaUrl: meetingNotesUrl(meeting.id),
      // One email per meeting part: a retried callback or a second Portal instance never sends twice.
      idempotencyKey: `meeting-notes/${meeting.id}/${Math.max(1, meeting.notesDrivePaths.length)}`
    });
    console.log(JSON.stringify({ evt: "meeting_notes_email", mid: meetingId, ...result }));
  } catch (error) {
    console.error("Meeting notes email failed", error instanceof Error ? error.message : error);
  }
}
