import { after } from "next/server";
import { mainAppOrigin } from "@/src/lib/hosts";
import type { KeyResponse } from "@/src/lib/meetings/types";
import { driveFetch } from "@/src/lib/nas-storage";
import { prisma } from "@/src/lib/prisma";
import { scribeVocabulary } from "@/src/server/meetings-scribe-vocabulary";
import { MEETING_ROOM_TOKEN_TTL_MS } from "@/src/lib/meetings/room-token";
import { readMeetingKey } from "@/src/server/meetings-keys";
import { issueMeetingRoomTicket, meetingRoomUrl } from "@/src/server/meetings-room-client";

/**
 * Portal → Drive Scribe (headless notes taker on the NAS). Never throws: a Scribe failure is
 * logged and the meeting goes on; a failed start marks the notes FAILED.
 *
 * Drive contract (POST, Bearer DRIVE_SERVICE_TOKEN):
 * - /api/service/meetings/scribe/start  { meetingId, title, startsAt, roomUrl, roomToken, key, epoch, portalBaseUrl, part }
 *   `part` numbers the Scribe sessions of one meeting (1, 2, …); notes callbacks echo it back.
 * - /api/service/meetings/scribe/rekey  { meetingId, key, epoch, roomUrl, roomToken, ticketExpiresAt }
 *   A new key and/or a fresh room ticket (re-ticketing, ~every 2 h and with every rekey).
 * - /api/service/meetings/scribe/stop   { meetingId }
 * - GET /api/service/meetings/<id>/transcript[?drivePath=<one part's folder>]  → markdown
 */

/** Rekey tries after the first fails: 5 s, then 20 s later (also on 404 while the Scribe starts). */
export const SCRIBE_RETRY_DELAYS_MS = [5_000, 20_000];

async function postScribe(action: "start" | "rekey" | "stop", body: Record<string, unknown>) {
  const response = await driveFetch(`/api/service/meetings/scribe/${action}`, {
    method: "POST",
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Drive scribe ${action} returned ${response.status}`);
}

/** Runs after the response when there is a request (Vercel keeps it alive), else right away. */
function inBackground(task: () => Promise<unknown>) {
  try {
    after(task);
  } catch {
    void task();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The Scribe's room ticket (4 h, like everyone's), for the meeting's current room generation. */
async function scribeTicket(meetingId: string, now = Date.now()) {
  const row = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { roomGeneration: true } });
  const roomToken = await issueMeetingRoomTicket({
    meetingId,
    uid: "scribe",
    name: "Notes",
    role: "scribe",
    admitted: true,
    gen: row?.roomGeneration ?? 0,
    now
  });
  return { roomToken, ticketExpiresAt: new Date(now + MEETING_ROOM_TOKEN_TTL_MS).toISOString() };
}

/** Starts a Scribe session: the next notes part (1 for the first), with a fresh ticket. */
export async function startMeetingScribe(
  meeting: { id: string; title: string; startsAt: Date },
  key: KeyResponse,
  now = new Date()
) {
  try {
    const { notesPart: part } = await prisma.meeting.update({
      where: { id: meeting.id },
      data: { notesPart: { increment: 1 }, scribeStartedAt: now },
      select: { notesPart: true }
    });
    const [{ roomToken }, vocabulary] = await Promise.all([
      scribeTicket(meeting.id, now.getTime()),
      // Names are a transcription hint only: never let them stop the notes from starting.
      scribeVocabulary().catch((error: unknown) => {
        console.error("Scribe vocabulary failed", error instanceof Error ? error.message : error);
        return [] as string[];
      })
    ]);
    await postScribe("start", {
      meetingId: meeting.id,
      title: meeting.title,
      startsAt: meeting.startsAt.toISOString(),
      roomUrl: meetingRoomUrl(),
      roomToken,
      key: key.key,
      epoch: key.epoch,
      portalBaseUrl: mainAppOrigin().replace(/\/+$/, ""),
      part,
      vocabulary
    });
    return true;
  } catch (error) {
    console.error("Meeting scribe start failed", { meetingId: meeting.id }, error instanceof Error ? error.message : error);
    await prisma.meeting
      .update({ where: { id: meeting.id }, data: { notesStatus: "FAILED", notesStatusAt: now, notesError: "The notes recorder couldn't start." } })
      .catch((updateError) => console.error("Meeting notes status update failed", updateError));
    return false;
  }
}

/** The newest key and a fresh ticket, so a delayed retry never sends an older key. */
async function sendRekey(meetingId: string, fallbackKey: KeyResponse | null) {
  const row = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { keyCiphertext: true, keyEpoch: true } });
  const key = (row ? readMeetingKey(row) : null) ?? fallbackKey;
  if (!key) return;
  const ticket = await scribeTicket(meetingId);
  await postScribe("rekey", { meetingId, key: key.key, epoch: key.epoch, roomUrl: meetingRoomUrl(), ...ticket });
}

/**
 * Sends the Scribe the current key plus a fresh room ticket (re-ticketing). The first try is
 * awaited; if it fails (including 404 while the Scribe is still starting), two more tries run in
 * the background (5 s and 20 s later), so a host's action never waits on the Drive.
 */
export async function rekeyMeetingScribe(meetingId: string, key: KeyResponse | null = null) {
  try {
    await sendRekey(meetingId, key);
    return true;
  } catch (error) {
    console.error("Meeting scribe rekey failed; retrying", { meetingId }, error instanceof Error ? error.message : error);
  }
  inBackground(async () => {
    for (const delay of SCRIBE_RETRY_DELAYS_MS) {
      await sleep(delay);
      try {
        await sendRekey(meetingId, key);
        return;
      } catch (error) {
        console.error("Meeting scribe rekey retry failed", { meetingId }, error instanceof Error ? error.message : error);
      }
    }
  });
  return false;
}

export async function stopMeetingScribe(meetingId: string) {
  try {
    await postScribe("stop", { meetingId });
  } catch (error) {
    console.error("Meeting scribe stop failed", { meetingId }, error instanceof Error ? error.message : error);
  }
}

/**
 * Full transcript markdown from the Drive, or null when there is none. The Drive joins every
 * notes part (a restarted or reopened Scribe) in order, so this is one request.
 */
export async function fetchMeetingTranscript(meetingId: string) {
  const response = await driveFetch(`/api/service/meetings/${encodeURIComponent(meetingId)}/transcript`, {
    signal: AbortSignal.timeout(15_000)
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("The transcript could not be loaded from the Drive.");
  if ((response.headers.get("content-type") || "").includes("application/json")) {
    const body = (await response.json()) as { markdown?: unknown };
    return typeof body.markdown === "string" ? body.markdown : null;
  }
  return response.text();
}
