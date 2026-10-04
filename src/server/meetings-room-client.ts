import type { MeetingRoomEvent } from "@/src/lib/meetings/protocol";
import {
  MEETING_ROOM_TOKEN_TTL_MS,
  signMeetingInternalToken,
  signMeetingToken,
  type MeetingRoomRole
} from "@/src/lib/meetings/room-token";

/** Portal ↔ meeting-room Worker: room tickets and Portal → room events. */

export function meetingRoomSecret() {
  const secret = process.env.MEETING_ROOM_SECRET?.trim();
  if (!secret) throw new Error("Meetings are not set up yet (MEETING_ROOM_SECRET is missing).");
  return secret;
}

export function meetingRoomUrl() {
  const url = process.env.MEETING_ROOM_URL?.trim().replace(/\/+$/, "");
  if (!url) throw new Error("Meetings are not set up yet (MEETING_ROOM_URL is missing).");
  return url;
}

export function issueMeetingRoomTicket(input: {
  meetingId: string;
  uid: string;
  name: string;
  role: MeetingRoomRole;
  admitted: boolean;
  /** Exec: first in line when the room hands host over. */
  exec?: boolean;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  return signMeetingToken(
    {
      v: 1,
      kind: "room",
      mid: input.meetingId,
      uid: input.uid,
      name: input.name,
      role: input.role,
      adm: input.admitted,
      ...(input.exec ? { exec: true } : {}),
      iat: now,
      exp: now + MEETING_ROOM_TOKEN_TTL_MS
    },
    meetingRoomSecret()
  );
}

/** Never throws: the user's action already succeeded in the Portal; the room catches up on reconnect. */
export async function sendMeetingRoomEvent(meetingId: string, event: MeetingRoomEvent) {
  try {
    const token = await signMeetingInternalToken("portal", meetingId, meetingRoomSecret());
    const response = await fetch(`${meetingRoomUrl()}/internal/rooms/${encodeURIComponent(meetingId)}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) {
      console.error("Meeting room event failed", { meetingId, event: event.t, status: response.status });
      return false;
    }
    return true;
  } catch (error) {
    console.error("Meeting room event failed", { meetingId, event: event.t }, error instanceof Error ? error.message : error);
    return false;
  }
}
