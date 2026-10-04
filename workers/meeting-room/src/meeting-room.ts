/**
 * One Durable Object per meeting: presence, lobby, hands, reactions, E2EE chat fan-out and
 * moderation. Uses the WebSocket Hibernation API; room state lives in DO storage and each
 * socket's ticket lives in its attachment, so both survive hibernation.
 */
import { DurableObject } from "cloudflare:workers";
import type { MeetingRoomEvent, MeetingRoomReport, MeetingServerMessage } from "../../../src/lib/meetings/protocol";
import { verifyMeetingRoomToken } from "../../../src/lib/meetings/room-token";
import type { Env } from "./env";
import { authorizeMedia, canRegisterSession, type MediaDecision, type MediaOp } from "./media-auth";
import { reportToPortal } from "./portal";
import { forgetKey, forgetUid, RATE_RULES, rateKey, socketRateKey, takeToken, type RateBuckets, type RateKind } from "./rate-limit";
import { handleClientMessage, rateKindOf } from "./room-messages";
import {
  applyRoomEvent,
  checkTicket,
  emptyDeadline,
  initialState,
  isEmptyDue,
  isRoomFull,
  joinParticipant,
  joinWaiting,
  leaveParticipant,
  leaveWaiting,
  participantList,
  registerSession,
  ticketFromPayload,
  waitingList,
  withMeetingId,
  type RoomState,
  type RoomTicket
} from "./room-state";
import { admitted, attachmentOf, closeSocket, hosts, select, send, sendAll, type SocketAttachment } from "./sockets";
import { parseClientMessage } from "./validation";

const STATE_KEY = "room";
const PING = JSON.stringify({ t: "ping" });
const PONG = JSON.stringify({ t: "pong" });
const REPORT_RETRY_MS = 60_000;
const CLOSE_REMOVED = 4003;
const CLOSE_DENIED = 4004;
const CLOSE_ENDED = 4010;
const CLOSE_FULL = 4029;

export class MeetingRoom extends DurableObject<Env> {
  private room: RoomState = initialState();
  /** In-memory only: losing rate-limit history on hibernation is harmless. */
  private buckets: RateBuckets = {};

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    void ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomState>(STATE_KEY)) ?? initialState();
    });
  }

  private async commit(next: RoomState): Promise<void> {
    this.room = next;
    await this.ctx.storage.put(STATE_KEY, next);
    await this.syncAlarm();
  }

  private async syncAlarm(): Promise<void> {
    const deadline = emptyDeadline(this.room);
    const current = await this.ctx.storage.getAlarm();
    if (deadline === null) {
      if (current !== null) await this.ctx.storage.deleteAlarm();
    } else if (current !== deadline) {
      await this.ctx.storage.setAlarm(deadline);
    }
  }

  private report(report: MeetingRoomReport): Promise<boolean> {
    const meetingId = this.room.meetingId;
    return meetingId ? reportToPortal(this.env, meetingId, report) : Promise.resolve(false);
  }

  /** Takes one token from a bucket; false when the caller is over the limit. */
  private take(key: string, kind: RateKind): boolean {
    const taken = takeToken(this.buckets, key, RATE_RULES[kind], Date.now());
    this.buckets = taken.buckets;
    return taken.allowed;
  }

  private sockets(): WebSocket[] {
    return this.ctx.getWebSockets();
  }

  private broadcastWaiting(): void {
    sendAll(select(this.sockets(), hosts), { t: "waiting", waiting: waitingList(this.room) });
  }

  private broadcastParticipants(uids: readonly string[], except?: WebSocket): void {
    const targets = select(this.sockets(), admitted, except);
    for (const uid of uids) {
      const participant = this.room.participants[uid];
      if (participant) sendAll(targets, { t: "participant", participant });
    }
  }

  private welcome(ws: WebSocket, ticket: RoomTicket, isAdmitted: boolean): void {
    const isHost = isAdmitted && ticket.role === "host";
    const participants = participantList(this.room).map((view) => (isAdmitted ? view : { ...view, tracks: {} }));
    send(ws, {
      t: "welcome",
      self: { uid: ticket.uid, admitted: isAdmitted, isHost },
      participants,
      waiting: isHost ? waitingList(this.room) : [],
      settings: this.room.settings,
      epoch: this.room.epoch
    });
  }

  // ---------------------------------------------------------------------------
  // WebSocket connect (forwarded by the Worker after its Origin + ticket checks)
  // ---------------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const meetingId = /^\/rooms\/([^/]+)\/ws$/.exec(url.pathname)?.[1];
    const payload = await verifyMeetingRoomToken(url.searchParams.get("token") ?? "", this.env.MEETING_ROOM_SECRET);
    if (!meetingId || !payload || payload.mid !== meetingId || request.headers.get("Upgrade") !== "websocket") {
      return new Response("Forbidden", { status: 403 });
    }
    const ticket = ticketFromPayload(payload);
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const check = checkTicket(this.room, ticket);
    if (!check.ok || isRoomFull(this.room, ticket)) {
      server.accept();
      if (!check.ok) send(server, { t: check.reason === "ended" ? "ended" : "removed" });
      else send(server, { t: "error", message: "This meeting is full." });
      const code = check.ok ? CLOSE_FULL : check.reason === "ended" ? CLOSE_ENDED : CLOSE_REMOVED;
      closeSocket(server, code, check.ok ? "full" : check.reason);
      return new Response(null, { status: 101, webSocket: client });
    }

    this.ctx.acceptWebSocket(server, [ticket.uid]);
    const attachment: SocketAttachment = { ...ticket, sock: crypto.randomUUID() };
    server.serializeAttachment(attachment);
    const base = withMeetingId(this.room, meetingId);
    if (ticket.adm) await this.connectAdmitted(server, ticket, base);
    else await this.connectWaiting(server, ticket, base);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async connectAdmitted(ws: WebSocket, ticket: RoomTicket, base: RoomState): Promise<void> {
    const wasWaiting = Boolean(base.waiting[ticket.uid]);
    const { state, reportStarted } = joinParticipant(base, ticket, Date.now());
    await this.commit(state);
    this.welcome(ws, ticket, true);
    this.broadcastParticipants([ticket.uid], ws);
    if (wasWaiting) this.broadcastWaiting();
    if (reportStarted) await this.report({ t: "started" });
  }

  private async connectWaiting(ws: WebSocket, ticket: RoomTicket, base: RoomState): Promise<void> {
    const { state, isNew } = joinWaiting(base, ticket, Date.now());
    await this.commit(state);
    this.welcome(ws, ticket, false);
    if (isNew) {
      this.broadcastWaiting();
      await this.report({ t: "knock", uid: ticket.uid, name: ticket.name });
    }
  }

  // ---------------------------------------------------------------------------
  // WebSocket messages and close
  // ---------------------------------------------------------------------------

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const attachment = attachmentOf(ws);
    if (!attachment) return closeSocket(ws, 1008, "No ticket");
    const ticket: RoomTicket = attachment;
    if (raw !== PING && !this.take(socketRateKey(attachment.sock), "message")) {
      return send(ws, { t: "error", message: "Too many messages. Slow down a little." });
    }
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) return send(ws, { t: "error", message: parsed.error });

    const now = Date.now();
    const kind = rateKindOf(parsed.value);
    if (kind && !this.take(rateKey(ticket.uid, kind), kind)) {
      return send(ws, { t: "error", message: "Slow down a little." });
    }

    const outcome = handleClientMessage(this.room, ticket, parsed.value, now);
    switch (outcome.kind) {
      case "pong":
        return send(ws, { t: "pong" });
      case "error":
        return send(ws, { t: "error", message: outcome.message });
      case "broadcast":
        return sendAll(select(this.sockets(), admitted), outcome.message);
      case "muted": {
        const message: MeetingServerMessage = { t: "muted", kind: outcome.muteKind, by: outcome.by };
        for (const uid of outcome.targets) sendAll(select(this.ctx.getWebSockets(uid), admitted), message);
        return;
      }
      case "update":
        await this.commit(outcome.state);
        return this.broadcastParticipants(outcome.changed);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    closeSocket(ws, code === 1005 || code === 1006 ? 1000 : code, reason);
    await this.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws);
  }

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    const ticket = attachmentOf(ws);
    if (!ticket) return;
    this.buckets = forgetKey(this.buckets, socketRateKey(ticket.sock));
    const sameKind = (other: RoomTicket) => other.adm === ticket.adm;
    if (select(this.ctx.getWebSockets(ticket.uid), sameKind, ws).length > 0) return;

    if (ticket.adm) {
      const { state, left } = leaveParticipant(this.room, ticket.uid, Date.now());
      if (!left) return;
      this.buckets = forgetUid(this.buckets, ticket.uid);
      await this.commit(state);
      sendAll(select(this.sockets(), admitted, ws), { t: "left", uid: ticket.uid });
      return;
    }
    const { state, changed } = leaveWaiting(this.room, ticket.uid);
    if (!changed) return;
    await this.commit(state);
    this.broadcastWaiting();
  }

  // ---------------------------------------------------------------------------
  // Alarm: report `empty` after MEETING_EMPTY_END_MS without humans
  // ---------------------------------------------------------------------------

  async alarm(): Promise<void> {
    if (!isEmptyDue(this.room, Date.now())) return this.syncAlarm();
    const ok = await this.report({ t: "empty" });
    if (!ok) {
      await this.ctx.storage.setAlarm(Date.now() + REPORT_RETRY_MS);
      return;
    }
    // The Portal answers with an `ended` event, which may already have arrived.
    if (this.room.endedAt === null) await this.commit({ ...this.room, emptySince: null });
  }

  // ---------------------------------------------------------------------------
  // RPC from the Worker
  // ---------------------------------------------------------------------------

  async authorizeMedia(meetingId: string, ticket: RoomTicket, op: MediaOp): Promise<MediaDecision> {
    if (this.room.meetingId !== meetingId) await this.commit(withMeetingId(this.room, meetingId));
    if (!this.take(rateKey(ticket.uid, "proxy"), "proxy")) {
      return { ok: false, status: 429, message: "Too many media requests. Slow down a little." };
    }
    return authorizeMedia(this.room, ticket, op);
  }

  /** Re-checks the caps (concurrent sessions/new calls); false means the session is not usable. */
  async registerSession(meetingId: string, sessionId: string, ticket: RoomTicket): Promise<boolean> {
    const base = withMeetingId(this.room, meetingId);
    if (!canRegisterSession(base, ticket)) return false;
    await this.commit(registerSession(base, sessionId, ticket.uid));
    return true;
  }

  async applyEvent(meetingId: string, event: MeetingRoomEvent): Promise<void> {
    const before = withMeetingId(this.room, meetingId);
    const next = applyRoomEvent(before, event, Date.now());
    if (event.t === "ended") {
      await this.ctx.storage.deleteAll();
      await this.commit(next);
    } else {
      await this.commit(next);
    }
    this.applyEventToSockets(before, event);
  }

  private applyEventToSockets(before: RoomState, event: MeetingRoomEvent): void {
    const all = this.sockets();
    switch (event.t) {
      case "admitted":
        sendAll(select(this.ctx.getWebSockets(event.uid), (t) => !t.adm), { t: "admitted" });
        return this.broadcastWaiting();
      case "denied":
        for (const ws of select(this.ctx.getWebSockets(event.uid), (t) => !t.adm)) {
          send(ws, { t: "denied" });
          closeSocket(ws, CLOSE_DENIED, "denied");
        }
        return this.broadcastWaiting();
      case "removed": {
        const theirs = this.ctx.getWebSockets(event.uid);
        for (const ws of select(theirs, () => true)) {
          send(ws, { t: "removed" });
          closeSocket(ws, CLOSE_REMOVED, "removed");
        }
        const others = select(all, admitted).filter((ws) => !theirs.includes(ws));
        if (before.participants[event.uid]) sendAll(others, { t: "left", uid: event.uid });
        if (before.waiting[event.uid]) this.broadcastWaiting();
        return;
      }
      case "rekey":
        return sendAll(select(all, admitted), { t: "rekey", epoch: event.epoch });
      case "settings":
        return sendAll(select(all, admitted), { t: "settings", settings: event.settings });
      case "ended":
        for (const ws of select(all, () => true)) {
          send(ws, { t: "ended" });
          closeSocket(ws, CLOSE_ENDED, "ended");
        }
        return;
    }
  }
}
