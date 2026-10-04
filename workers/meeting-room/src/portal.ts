/** Room -> Portal reports (POST <PORTAL_BASE_URL>/api/service/meetings/<id>/room). */
import type { MeetingRoomReport } from "../../../src/lib/meetings/protocol";
import { signMeetingInternalToken } from "../../../src/lib/meetings/room-token";
import type { Env } from "./env";

/** `status` is the Portal's HTTP status, or null when it couldn't be reached. */
export type ReportResult = { ok: boolean; status: number | null };

export async function reportToPortal(env: Env, meetingId: string, report: MeetingRoomReport): Promise<ReportResult> {
  const base = (env.PORTAL_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base) {
    console.error("meeting-room: PORTAL_BASE_URL is not set; report dropped", report.t);
    return { ok: false, status: null };
  }
  try {
    const token = await signMeetingInternalToken("room", meetingId, env.MEETING_ROOM_SECRET);
    const response = await fetch(`${base}/api/service/meetings/${encodeURIComponent(meetingId)}/room`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(report)
    });
    if (!response.ok) console.error("meeting-room: Portal report failed", report.t, response.status);
    return { ok: response.ok, status: response.status };
  } catch (error) {
    console.error("meeting-room: Portal report error", report.t, error instanceof Error ? error.message : error);
    return { ok: false, status: null };
  }
}
