/** Helpers over the Durable Object's hibernatable sockets. Each socket carries its RoomTicket. */
import type { MeetingServerMessage } from "../../../src/lib/meetings/protocol";
import type { RoomTicket } from "./room-state";

/** Per-socket attachment: the ticket plus a random socket id (for the per-socket rate limit). */
export type SocketAttachment = RoomTicket & { sock: string };

export function attachmentOf(ws: WebSocket): SocketAttachment | null {
  try {
    return (ws.deserializeAttachment() as SocketAttachment | null) ?? null;
  } catch {
    return null;
  }
}

export function ticketOf(ws: WebSocket): RoomTicket | null {
  return attachmentOf(ws);
}

export function send(ws: WebSocket, message: MeetingServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // The socket is already closing; its close handler cleans up.
  }
}

export function closeSocket(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // Already closed.
  }
}

export type SocketFilter = (ticket: RoomTicket) => boolean;

export const admitted: SocketFilter = (ticket) => ticket.adm;
export const hosts: SocketFilter = (ticket) => ticket.adm && ticket.role === "host";

/** Open sockets (optionally of one uid) whose ticket passes `filter`, excluding `except`. */
export function select(
  all: readonly WebSocket[],
  filter: SocketFilter,
  except?: WebSocket
): WebSocket[] {
  return all.filter((ws) => {
    if (ws === except || ws.readyState !== WebSocket.READY_STATE_OPEN) return false;
    const ticket = ticketOf(ws);
    return ticket !== null && filter(ticket);
  });
}

export function sendAll(sockets: readonly WebSocket[], message: MeetingServerMessage): void {
  const payload = JSON.stringify(message);
  for (const ws of sockets) {
    try {
      ws.send(payload);
    } catch {
      // Ignore sockets that are closing.
    }
  }
}
