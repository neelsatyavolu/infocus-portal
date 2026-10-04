/**
 * Pure checks for the partytracks proxy (/rooms/:id/partytracks/*).
 * Only the paths the partytracks client actually calls are allowed through, and only for
 * admitted tickets whose uid currently has a room socket open.
 */
import { checkTicket, type RoomState, type RoomTicket } from "./room-state";

export type SessionAction = "tracks/new" | "tracks/close" | "tracks/update" | "renegotiate";

export type PartyTracksRoute =
  | { kind: "ice" }
  | { kind: "newSession" }
  | { kind: "session"; sessionId: string; action: SessionAction };

const SESSION_ACTIONS: readonly SessionAction[] = ["tracks/new", "tracks/close", "tracks/update", "renegotiate"];
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** `subpath` is the pathname after the prefix, e.g. "/sessions/abc/tracks/new". */
export function classifyPartyTracksPath(subpath: string): PartyTracksRoute | null {
  if (subpath === "/generate-ice-servers") return { kind: "ice" };
  if (subpath === "/sessions/new") return { kind: "newSession" };
  const match = /^\/sessions\/([^/]+)\/(.+)$/.exec(subpath);
  if (!match) return null;
  const [, sessionId, action] = match;
  if (!sessionId || !SESSION_ID.test(sessionId) || sessionId === "new") return null;
  if (!(SESSION_ACTIONS as readonly string[]).includes(action ?? "")) return null;
  return { kind: "session", sessionId, action: action as SessionAction };
}

export type MediaOp =
  | { kind: "ice" }
  | { kind: "newSession" }
  | { kind: "session"; sessionId: string; pushes: number; pullSessionIds: readonly string[] };

export type MediaDecision = { ok: true } | { ok: false; status: 401 | 403 | 429; message: string };

/** Live Realtime sessions one uid may own (two tabs plus reconnects). */
export const MAX_SESSIONS_PER_UID = 4;
/** Hard cap on the room's whole ownership map. */
export const MAX_ROOM_SESSIONS = 400;

export function sessionCount(state: RoomState, uid?: string): number {
  const owners = Object.values(state.sessions);
  return uid === undefined ? owners.length : owners.filter((owner) => owner === uid).length;
}

export function authorizeMedia(state: RoomState, ticket: RoomTicket, op: MediaOp): MediaDecision {
  const check = checkTicket(state, ticket);
  if (!check.ok) return { ok: false, status: 401, message: `Ticket rejected: ${check.reason}.` };
  if (!ticket.adm) return { ok: false, status: 403, message: "Not admitted." };
  if (!state.participants[ticket.uid]) {
    return { ok: false, status: 403, message: "Join the room socket before starting media." };
  }
  if (op.kind === "newSession") {
    if (sessionCount(state, ticket.uid) >= MAX_SESSIONS_PER_UID || sessionCount(state) >= MAX_ROOM_SESSIONS) {
      return { ok: false, status: 429, message: "Too many media sessions. Close another tab and try again." };
    }
    return { ok: true };
  }
  if (op.kind !== "session") return { ok: true };
  if (state.sessions[op.sessionId] !== ticket.uid) {
    return { ok: false, status: 403, message: "That media session is not yours." };
  }
  if (ticket.role === "scribe" && op.pushes > 0) {
    return { ok: false, status: 403, message: "The Scribe never publishes." };
  }
  if (op.pullSessionIds.some((sessionId) => state.sessions[sessionId] === undefined)) {
    return { ok: false, status: 403, message: "That track is not in this meeting." };
  }
  return { ok: true };
}

/** Final check when sessions/new returns: still in the room and still under the caps. */
export function canRegisterSession(state: RoomState, ticket: RoomTicket): boolean {
  return authorizeMedia(state, ticket, { kind: "newSession" }).ok;
}
