import type { MeetingRoom } from "./meeting-room";

export interface Env {
  MEETING_ROOM: DurableObjectNamespace<MeetingRoom>;
  /** Portal origin for room reports, e.g. https://portal.example.edu (no trailing slash). */
  PORTAL_BASE_URL: string;
  /** Comma-separated browser origins allowed to open sockets and call the SFU proxy. */
  ALLOWED_ORIGINS: string;
  // Secrets (wrangler secret put):
  MEETING_ROOM_SECRET: string;
  REALTIME_APP_ID: string;
  REALTIME_APP_TOKEN: string;
  TURN_KEY_ID?: string;
  TURN_KEY_TOKEN?: string;
}
