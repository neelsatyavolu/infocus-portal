import { mainAppOrigin } from "@/src/lib/hosts";
import type { KeyResponse } from "@/src/lib/meetings/types";
import { driveFetch } from "@/src/lib/nas-storage";
import { prisma } from "@/src/lib/prisma";
import { issueMeetingRoomTicket, meetingRoomUrl } from "@/src/server/meetings-room-client";

/**
 * Portal → Drive Scribe (headless notes taker on the NAS). Never throws: a Scribe failure is
 * logged and the meeting goes on; a failed start marks the notes FAILED.
 */

async function postScribe(action: "start" | "rekey" | "stop", body: Record<string, unknown>) {
  const response = await driveFetch(`/api/service/meetings/scribe/${action}`, {
    method: "POST",
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Drive scribe ${action} returned ${response.status}`);
}

export async function startMeetingScribe(
  meeting: { id: string; title: string; startsAt: Date },
  key: KeyResponse
) {
  try {
    const roomToken = await issueMeetingRoomTicket({
      meetingId: meeting.id,
      uid: "scribe",
      name: "Notes",
      role: "scribe",
      admitted: true
    });
    await postScribe("start", {
      meetingId: meeting.id,
      title: meeting.title,
      startsAt: meeting.startsAt.toISOString(),
      roomUrl: meetingRoomUrl(),
      roomToken,
      key: key.key,
      epoch: key.epoch,
      portalBaseUrl: mainAppOrigin().replace(/\/+$/, "")
    });
    return true;
  } catch (error) {
    console.error("Meeting scribe start failed", { meetingId: meeting.id }, error instanceof Error ? error.message : error);
    await prisma.meeting
      .update({ where: { id: meeting.id }, data: { notesStatus: "FAILED" } })
      .catch((updateError) => console.error("Meeting notes status update failed", updateError));
    return false;
  }
}

export async function rekeyMeetingScribe(meetingId: string, key: KeyResponse) {
  try {
    await postScribe("rekey", { meetingId, key: key.key, epoch: key.epoch });
  } catch (error) {
    console.error("Meeting scribe rekey failed", { meetingId }, error instanceof Error ? error.message : error);
  }
}

export async function stopMeetingScribe(meetingId: string) {
  try {
    await postScribe("stop", { meetingId });
  } catch (error) {
    console.error("Meeting scribe stop failed", { meetingId }, error instanceof Error ? error.message : error);
  }
}

/** Full transcript markdown from the Drive, or null when there is none. */
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
