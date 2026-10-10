import type { MeetingNotesStatus } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { readMeetingKey } from "@/src/server/meetings-keys";
import { emailMeetingNotes, shouldEmailNotes } from "@/src/server/meetings-notes-email";
import { startMeetingScribe } from "@/src/server/meetings-scribe";

/**
 * Notes in parts. A long or restarted meeting has several Scribe sessions ("parts"); each READY part
 * adds its Drive folder to notesDrivePaths and its summary under a "Part N" heading. Callbacks for
 * an older part never change the current status, so a new RECORDING can't hide an earlier READY part.
 */

/** A stopped Scribe is restarted at most once per 10 minutes, and only while the meeting is LIVE. */
export const SCRIBE_RESTART_GAP_MS = 10 * 60 * 1000;
export const NOTES_PROCESSING_LIMIT_MS = 12 * 60 * 60 * 1000;
export const NOTES_RECORDING_AFTER_END_MS = 60 * 60 * 1000;

export type NotesUpdate = { status: MeetingNotesStatus; summaryMarkdown?: string; drivePath?: string; part?: number; reason?: string };

type NotesRow = { notesPart: number; notesDrivePaths: string[]; notesSummary: string | null };

/** The Meeting fields a notes callback changes (pure). */
export function notesUpdateData(meeting: NotesRow, input: NotesUpdate, now: Date) {
  const current = input.part === undefined || input.part >= meeting.notesPart;
  const data: {
    notesStatus?: MeetingNotesStatus;
    notesStatusAt?: Date;
    notesError?: string | null;
    notesDrivePath?: string;
    notesDrivePaths?: string[];
    notesSummary?: string;
  } = {};
  if (current) {
    data.notesStatus = input.status;
    data.notesStatusAt = now;
    if (input.status !== "FAILED") data.notesError = null;
    else if (input.reason) data.notesError = input.reason;
    if (input.drivePath) data.notesDrivePath = input.drivePath;
  }

  const paths = meeting.notesDrivePaths;
  const summary = input.summaryMarkdown;
  if (input.status === "READY") {
    // A callback with no folder is a retry of the current part, not a new one.
    const drivePath = input.drivePath;
    const isNewPart = typeof drivePath === "string" && drivePath.length > 0 && !paths.includes(drivePath);
    if (drivePath && isNewPart) data.notesDrivePaths = [...paths, drivePath];
    if (summary !== undefined && (drivePath || paths.length === 0)) {
      const partNumber = isNewPart ? paths.length + 1 : drivePath ? paths.indexOf(drivePath) + 1 : 1;
      // Part 1 owns the whole summary only while it is the only part (a retried part-1 READY after
      // part 2 arrived must not drop part 2).
      if (partNumber <= 1 && paths.length <= 1) data.notesSummary = summary;
      else if (isNewPart) data.notesSummary = `${meeting.notesSummary ?? ""}\n\n## Part ${partNumber}\n\n${summary}`.trim();
    }
  } else if (summary !== undefined && current && paths.length === 0) {
    data.notesSummary = summary;
  }
  return { data, current };
}

/**
 * Starts a new Scribe session when the current one stopped (4 h cap, crash, failure) while the
 * meeting is still LIVE with notes on. Claims the slot first, so at most one restart per 10 minutes.
 */
export async function maybeRestartScribe(meetingId: string, now = new Date()) {
  const claimed = await prisma.meeting.updateMany({
    where: {
      id: meetingId,
      status: "LIVE",
      notesEnabled: true,
      notesStatus: { in: ["PROCESSING", "READY", "FAILED"] },
      OR: [{ scribeStartedAt: null }, { scribeStartedAt: { lte: new Date(now.getTime() - SCRIBE_RESTART_GAP_MS) } }]
    },
    data: { scribeStartedAt: now }
  });
  if (claimed.count === 0) return false;
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, title: true, startsAt: true, keyCiphertext: true, keyEpoch: true }
  });
  const key = meeting ? readMeetingKey(meeting) : null;
  if (!meeting || !key) return false;
  console.log(JSON.stringify({ evt: "scribe_restart", mid: meetingId }));
  return startMeetingScribe(meeting, key, now);
}

/** Drive → Portal notes callback. */
export async function applyMeetingNotesUpdate(meetingId: string, input: NotesUpdate, now = new Date()) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      status: true,
      notesEnabled: true,
      notesStatus: true,
      notesPart: true,
      notesDrivePaths: true,
      notesSummary: true
    }
  });
  if (!meeting) throw new Error("NOT_FOUND");
  const { data, current } = notesUpdateData(meeting, input, now);
  if (Object.keys(data).length > 0) await prisma.meeting.update({ where: { id: meetingId }, data });
  if (shouldEmailNotes(meeting, input.status, data)) await emailMeetingNotes(meetingId);
  // The current Scribe stopped while people are still in the call: start the next part.
  const stopped = input.status === "PROCESSING" || input.status === "READY" || input.status === "FAILED";
  if (current && stopped && meeting.status === "LIVE" && meeting.notesEnabled) await maybeRestartScribe(meetingId, now);
  return { notesStatus: current ? input.status : null };
}

/**
 * Cron: notes stuck PROCESSING for 12 hours, or RECORDING an hour after the meeting ended, are
 * marked FAILED with a reason (so the page stops saying "processing" forever).
 */
export async function sweepStuckNotes(now = new Date()) {
  const processingBefore = new Date(now.getTime() - NOTES_PROCESSING_LIMIT_MS);
  const processing = await prisma.meeting.updateMany({
    where: {
      notesStatus: "PROCESSING",
      OR: [{ notesStatusAt: { lt: processingBefore } }, { notesStatusAt: null, updatedAt: { lt: processingBefore } }]
    },
    data: { notesStatus: "FAILED", notesStatusAt: now, notesError: "Notes were still processing after 12 hours." }
  });
  const recording = await prisma.meeting.updateMany({
    where: { status: "ENDED", notesStatus: "RECORDING", endedAt: { lt: new Date(now.getTime() - NOTES_RECORDING_AFTER_END_MS) } },
    data: { notesStatus: "FAILED", notesStatusAt: now, notesError: "The notes recorder didn't finish after the meeting ended." }
  });
  return { processing: processing.count, recording: recording.count };
}

/** Cron fallback for restarts the callback missed: LIVE meetings with notes on whose Scribe stopped. */
export async function restartStoppedScribes(now = new Date()) {
  const rows = await prisma.meeting.findMany({
    where: {
      status: "LIVE",
      notesEnabled: true,
      notesStatus: { in: ["PROCESSING", "READY", "FAILED"] },
      OR: [{ scribeStartedAt: null }, { scribeStartedAt: { lte: new Date(now.getTime() - SCRIBE_RESTART_GAP_MS) } }]
    },
    select: { id: true }
  });
  let restarted = 0;
  for (const row of rows) if (await maybeRestartScribe(row.id, now)) restarted += 1;
  return restarted;
}
