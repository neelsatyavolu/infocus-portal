import { prisma } from "@/src/lib/prisma";
import { readMeetingKey } from "@/src/server/meetings-keys";
import { endMeeting } from "@/src/server/meetings-moderation";
import { restartStoppedScribes, sweepStuckNotes } from "@/src/server/meetings-notes";
import { MAX_MEETING_DURATION_MS } from "@/src/server/meetings-schedule";
import { rekeyMeetingScribe } from "@/src/server/meetings-scribe";
import { checkMeetingUsage } from "@/src/server/meetings-usage";

/**
 * Every-minute upkeep for long or stranded meetings, and the Scribe's 2-hourly re-ticket.
 * Each step is independent: one failing never stops the others.
 */

async function step<T>(name: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.error(`Meetings housekeeping: ${name} failed`, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * LIVE meetings past their latest possible end (start + 8 h) are stranded (the room never sent
 * `empty`, e.g. it lost the report): end them as STALE, which also tells the room and the Scribe.
 */
export async function endStaleMeetings(now = new Date()) {
  const stale = await prisma.meeting.findMany({
    where: { status: "LIVE", startsAt: { lt: new Date(now.getTime() - MAX_MEETING_DURATION_MS) } },
    select: { id: true }
  });
  for (const meeting of stale) await endMeeting(meeting.id, now, "STALE");
  return stale.length;
}

/**
 * Keeps the usage meter fresh while calls run (its 10-minute cache). Over the limit, calls in
 * progress keep going and only new joins are refused (see joinMeeting).
 */
export async function refreshMeetingUsage(now = new Date()) {
  const live = await prisma.meeting.count({ where: { status: "LIVE" } });
  return live > 0 ? checkMeetingUsage(now) : null;
}

export async function runMeetingHousekeeping(now = new Date()) {
  return {
    staleEnded: await step("stale", () => endStaleMeetings(now)),
    usage: await step("usage", () => refreshMeetingUsage(now)),
    notesSwept: await step("notes sweep", () => sweepStuckNotes(now)),
    scribesRestarted: await step("scribe restart", () => restartStoppedScribes(now))
  };
}

/** Every ~2 h: a fresh ticket (and the current key) for every recording Scribe, before its 4 h ticket runs out. */
export async function reticketScribes() {
  const rows = await prisma.meeting.findMany({
    where: { status: "LIVE", notesEnabled: true, notesStatus: "RECORDING" },
    select: { id: true, keyCiphertext: true, keyEpoch: true }
  });
  let sent = 0;
  for (const row of rows) {
    if (await rekeyMeetingScribe(row.id, readMeetingKey(row))) sent += 1;
  }
  return { scribes: rows.length, sent };
}
