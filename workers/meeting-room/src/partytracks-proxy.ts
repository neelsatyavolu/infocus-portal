/**
 * /rooms/:id/partytracks/* -> Cloudflare Realtime SFU via partytracks' routePartyTracksRequest.
 *
 * Ticket: `token` query param (partytracks' `apiExtraParams`). The client does NOT add
 * apiExtraParams to generate-ice-servers, so the call UI must fetch
 * `<prefix>/generate-ice-servers?token=…` itself and pass `iceServers` to PartyTracks.
 * Media calls also need the uid's room socket to be open (see media-auth.ts).
 */
import { routePartyTracksRequest } from "partytracks/server";
import { verifyMeetingRoomToken } from "../../../src/lib/meetings/room-token";
import { readLimitedBody } from "./body-limit";
import type { Env } from "./env";
import { corsHeaders, errorResponse, roomTicketFromRequest, withCors } from "./http";
import { classifyPartyTracksPath, type MediaOp, type PartyTracksRoute } from "./media-auth";
import { sanitizeSessionBody } from "./partytracks-body";
import { ticketFromPayload, type RoomTicket } from "./room-state";
import { logEvent, shortId } from "./log";

type ProxyContext = {
  env: Env;
  request: Request;
  meetingId: string;
  origin: string;
  prefix: string;
  /** Filled in while handling, for the log line (counts and short ids only). */
  note?: { pushes?: number; pulls?: number; pullSids?: string; newSid?: string | null };
};

/** The validated request: what Cloudflare receives (body is re-serialized, never the raw input). */
type Prepared = { op: MediaOp; body: string | null };

function expectedMethod(route: PartyTracksRoute): string {
  if (route.kind === "ice") return "GET";
  if (route.kind === "newSession" || route.action === "tracks/new") return "POST";
  return "PUT";
}

function prepare(route: PartyTracksRoute, text: string): Prepared | null {
  if (route.kind !== "session") return text.length === 0 ? { op: route, body: null } : null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const clean = sanitizeSessionBody(route.action, json);
  if (!clean) return null;
  const { pushes, pullSessionIds } = clean;
  return { op: { kind: "session", sessionId: route.sessionId, pushes, pullSessionIds }, body: JSON.stringify(clean.body) };
}

/** A clean upstream request: no query string (it holds the ticket), no browser headers. */
function upstreamRequest(request: Request, body: string | null): Request {
  const url = new URL(request.url);
  url.search = "";
  const headers = new Headers();
  if (body !== null) {
    headers.set("Content-Type", "application/json");
    headers.set("Content-Length", String(new TextEncoder().encode(body).byteLength));
  }
  return new Request(url.toString(), { method: request.method, headers, body });
}

function parseSessionId(text: string): string | null {
  try {
    const sessionId = (JSON.parse(text) as { sessionId?: unknown }).sessionId;
    return typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null;
  } catch {
    return null;
  }
}

async function proxy(ctx: ProxyContext, ticket: RoomTicket, route: PartyTracksRoute, body: string | null) {
  const { env, origin, prefix } = ctx;
  const response = await routePartyTracksRequest({
    prefix,
    appId: env.REALTIME_APP_ID,
    token: env.REALTIME_APP_TOKEN,
    turnServerAppId: env.TURN_KEY_ID,
    turnServerAppToken: env.TURN_KEY_TOKEN,
    lockSessionToInitiator: false,
    request: upstreamRequest(ctx.request, body)
  });
  if (route.kind !== "newSession" || !response.ok) return withCors(response, origin);

  const text = await response.text();
  const sessionId = parseSessionId(text);
  if (!sessionId) {
    console.error("meeting-room: sessions/new response had no sessionId");
    return errorResponse(502, "The media server did not create a session.", corsHeaders(origin));
  }
  const stub = env.MEETING_ROOM.get(env.MEETING_ROOM.idFromName(ctx.meetingId));
  if (ctx.note) ctx.note.newSid = shortId(sessionId);
  if (!(await stub.registerSession(ctx.meetingId, sessionId, ticket))) {
    return errorResponse(429, "Too many media sessions. Close another tab and try again.", corsHeaders(origin));
  }
  return withCors(response, origin, text);
}

function routeName(route: PartyTracksRoute | null): string {
  if (!route) return "unknown";
  return route.kind === "session" ? route.action : route.kind;
}

/**
 * Only an error's code and description, never its body as a whole (it could echo SDP).
 * Cloudflare Realtime answers `{ errorCode, errorDescription }`; our own errors `{ error: { message } }`.
 */
export async function proxyErrorSummary(response: Response): Promise<string | null> {
  try {
    const json = (await response.clone().json()) as {
      errorCode?: unknown;
      errorDescription?: unknown;
      error?: { message?: unknown } | unknown;
    };
    const ours = typeof json.error === "object" && json.error !== null ? (json.error as { message?: unknown }).message : json.error;
    const parts = [json.errorCode, json.errorDescription, ours].filter((part): part is string => typeof part === "string");
    return parts.length > 0 ? parts.join(": ").slice(0, 200) : null;
  } catch {
    return null;
  }
}

/** One log line per proxy call: route, status, latency and short session id; errors get their reason. */
export async function handlePartyTracks(ctx: ProxyContext, subpath: string): Promise<Response> {
  const started = Date.now();
  const route = classifyPartyTracksPath(subpath);
  const uid = await verifyMeetingRoomToken(roomTicketFromRequest(ctx.request), ctx.env.MEETING_ROOM_SECRET)
    .then((payload) => payload?.uid ?? null)
    .catch(() => null);
  const note: NonNullable<ProxyContext["note"]> = {};
  const response = await handlePartyTracksInner({ ...ctx, note }, subpath);
  logEvent("proxy", ctx.meetingId, uid, {
    route: routeName(route),
    method: ctx.request.method,
    status: response.status,
    ms: Date.now() - started,
    sid: route?.kind === "session" ? shortId(route.sessionId) : note.newSid,
    pushes: note.pushes,
    pulls: note.pulls,
    pullSids: note.pullSids || undefined,
    error: response.ok ? undefined : await proxyErrorSummary(response)
  });
  return response;
}

async function handlePartyTracksInner(ctx: ProxyContext, subpath: string): Promise<Response> {
  const { env, request, meetingId, origin } = ctx;
  const deny = (status: number, message: string) => errorResponse(status, message, corsHeaders(origin));

  const payload = await verifyMeetingRoomToken(roomTicketFromRequest(request), env.MEETING_ROOM_SECRET);
  if (!payload || payload.mid !== meetingId) return deny(401, "Invalid or expired ticket.");
  if (!payload.adm) return deny(403, "Not admitted.");
  if (!env.REALTIME_APP_ID || !env.REALTIME_APP_TOKEN) return deny(503, "Media is not configured.");

  const route = classifyPartyTracksPath(subpath);
  if (!route) return deny(404, "Not found.");
  if (request.method !== expectedMethod(route)) return deny(405, "Method not allowed.");
  const read = await readLimitedBody(request);
  if (!read.ok) return deny(read.status, read.status === 413 ? "Request is too large." : "Bad request.");
  const prepared = prepare(route, read.text);
  if (!prepared) return deny(400, "Malformed media request.");
  if (ctx.note && prepared.op.kind === "session") {
    ctx.note.pushes = prepared.op.pushes;
    ctx.note.pulls = prepared.op.pullSessionIds.length;
    ctx.note.pullSids = prepared.op.pullSessionIds.map((id) => shortId(id)).join(",");
  }

  const ticket = ticketFromPayload(payload);
  const stub = env.MEETING_ROOM.get(env.MEETING_ROOM.idFromName(meetingId));
  const decision = await stub.authorizeMedia(meetingId, ticket, prepared.op);
  if (!decision.ok) return deny(decision.status, decision.message);
  return proxy(ctx, ticket, route, prepared.body);
}
