/**
 * infocus-meeting-room Worker router.
 *   GET  /rooms/:id/ws?token=…            WebSocket into the meeting's Durable Object
 *   ALL  /rooms/:id/partytracks/*?token=… Cloudflare Realtime SFU proxy (see partytracks-proxy.ts)
 *   POST /internal/rooms/:id/events       Portal -> room events (Bearer internal token from "portal")
 */
import { verifyMeetingInternalToken, verifyMeetingRoomToken } from "../../../src/lib/meetings/room-token";
import type { Env } from "./env";
import { allowedOrigin, bearerToken, corsHeaders, errorResponse, json, parseAllowedOrigins } from "./http";
import { handlePartyTracks } from "./partytracks-proxy";
import { parseRoomEvent } from "./validation";

export { MeetingRoom } from "./meeting-room";

const MEETING_ID = "([A-Za-z0-9_-]{1,64})";
const WS_PATH = new RegExp(`^/rooms/${MEETING_ID}/ws$`);
const PARTYTRACKS_PATH = new RegExp(`^/rooms/${MEETING_ID}/partytracks(/.*)$`);
const EVENTS_PATH = new RegExp(`^/internal/rooms/${MEETING_ID}/events$`);

function roomStub(env: Env, meetingId: string) {
  return env.MEETING_ROOM.get(env.MEETING_ROOM.idFromName(meetingId));
}

async function handleWebSocket(request: Request, env: Env, meetingId: string): Promise<Response> {
  if (request.method !== "GET") return errorResponse(405, "Method not allowed.");
  if (request.headers.get("Upgrade") !== "websocket") return errorResponse(426, "Expected a WebSocket upgrade.");
  if (!allowedOrigin(request, parseAllowedOrigins(env.ALLOWED_ORIGINS))) return errorResponse(403, "Origin not allowed.");
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const payload = await verifyMeetingRoomToken(token, env.MEETING_ROOM_SECRET);
  if (!payload || payload.mid !== meetingId) return errorResponse(401, "Invalid or expired ticket.");
  return roomStub(env, meetingId).fetch(request);
}

async function handleEvents(request: Request, env: Env, meetingId: string): Promise<Response> {
  if (request.method !== "POST") return errorResponse(405, "Method not allowed.");
  const token = bearerToken(request);
  if (!token || !(await verifyMeetingInternalToken(token, env.MEETING_ROOM_SECRET, "portal", meetingId))) {
    return errorResponse(401, "Unauthorized.");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "Body must be JSON.");
  }
  const event = parseRoomEvent(body);
  if (!event.ok) return errorResponse(400, event.error);
  await roomStub(env, meetingId).applyEvent(meetingId, event.value);
  return json({ ok: true });
}

async function handlePartyTracksRoute(request: Request, env: Env, meetingId: string, subpath: string) {
  const origin = allowedOrigin(request, parseAllowedOrigins(env.ALLOWED_ORIGINS));
  if (!origin) return errorResponse(403, "Origin not allowed.");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  const prefix = `/rooms/${meetingId}/partytracks`;
  return handlePartyTracks({ env, request, meetingId, origin, prefix }, subpath);
}

async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const ws = WS_PATH.exec(pathname);
  if (ws?.[1]) return handleWebSocket(request, env, ws[1]);
  const tracks = PARTYTRACKS_PATH.exec(pathname);
  if (tracks?.[1] && tracks[2]) return handlePartyTracksRoute(request, env, tracks[1], tracks[2]);
  const events = EVENTS_PATH.exec(pathname);
  if (events?.[1]) return handleEvents(request, env, events[1]);
  return errorResponse(404, "Not found.");
}

export default {
  async fetch(request, env): Promise<Response> {
    if (!env.MEETING_ROOM_SECRET) {
      console.error("meeting-room: MEETING_ROOM_SECRET is not set");
      return errorResponse(503, "Meeting room is not configured.");
    }
    try {
      return await route(request, env);
    } catch (error) {
      console.error("meeting-room: unhandled error", error instanceof Error ? error.message : error);
      return errorResponse(500, "Something went wrong.");
    }
  }
} satisfies ExportedHandler<Env>;
