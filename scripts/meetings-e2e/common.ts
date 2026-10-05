/**
 * Shared helpers for the terminal Meetings tests (scripts/meetings-smoke.ts, scripts/meetings-e2e-load.ts):
 * env config, PASS/FAIL report, room tickets, the partytracks proxy call shape, the room socket,
 * werift peer connections and cleanup. No browser; werift is the WebRTC stack.
 */
import { randomBytes } from "node:crypto";
import WebSocket from "ws";
import {
  RTCPeerConnection,
  useAbsSendTime as absSendTimeExtension,
  useNACK as nackFeedback,
  useOPUS as opusCodec,
  usePLI as pliFeedback,
  useSdesMid as sdesMidExtension,
  useTransportWideCC as transportCcExtension,
  useTWCC as twccFeedback,
  useVP8 as vp8Codec,
  type RTCRtpTransceiver
} from "werift";
import {
  MEETING_ROOM_TOKEN_TTL_MS,
  signMeetingInternalToken,
  signMeetingToken,
  type MeetingRoomRole
} from "../../src/lib/meetings/room-token";
import type { MeetingRoomEvent, MeetingServerMessage } from "../../src/lib/meetings/protocol";

export const SECRET = process.env.MEETING_ROOM_SECRET ?? "";
export const ROOM_URL = (process.env.MEETING_ROOM_URL ?? "https://meet-api.infocuspaly.com").replace(/\/+$/, "");
export const ORIGIN = process.env.SMOKE_ORIGIN ?? "https://meet.infocuspaly.com";
export const STEP_TIMEOUT_MS = 20_000;

export type Kind = "audio" | "video";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose proxy/stats JSON; each check reads what it needs
export type Json = Record<string, any>;

export function requireSecret() {
  if (SECRET) return;
  console.error("MEETING_ROOM_SECRET is required.");
  process.exit(1);
}

export function newMeetingId(prefix: string) {
  return `${prefix}${randomBytes(6).toString("hex")}`;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export type Check = { name: string; ok: boolean; detail: string };
export const checks: Check[] = [];

export function check(name: string, ok: boolean, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

export function info(message: string) {
  console.log(`      ${message}`);
}

/** Prints the summary and exits 0 when every check passed, else 1. */
export function finish(): never {
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${failed.length === 0 ? "PASS" : "FAIL"}: ${checks.length - failed.length}/${checks.length} checks passed`);
  for (const c of failed) console.log(`  FAIL ${c.name}: ${c.detail}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

export function timeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out: ${what}`)), ms);
    promise.then(
      (value) => (clearTimeout(timer), resolve(value)),
      (error) => (clearTimeout(timer), reject(error))
    );
  });
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export const now = () => performance.timeOrigin + performance.now();

export function percentile(values: readonly number[], p: number) {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

// ---------------------------------------------------------------------------
// Room: tickets, partytracks proxy calls, room socket, Portal `ended`
// ---------------------------------------------------------------------------

export type Reply = { status: number; body: Json };
export const isOk = (status: number) => status >= 200 && status < 300;

export function describe(reply: Reply) {
  const { status, body } = reply;
  const error = body.error ?? body.errorDescription ?? body.errorCode ?? body.raw;
  return error ? `${status} ${String(error)}` : String(status);
}

export type RoomClient = ReturnType<typeof roomClient>;
export type TicketOptions = { mid?: string; ttlMs?: number; gen?: number };
/** A ticket string, or the browser's split: `query` from the media session's start, `bearer` current. */
export type ProxyAuth = string | { query: string; bearer: string };

export function roomClient(meetingId: string) {
  const prefix = `${ROOM_URL}/rooms/${meetingId}/partytracks`;

  /**
   * A room ticket like the Portal's /join or /ticket issues: 4 h TTL unless `ttlMs` says otherwise,
   * room generation `gen` (absent = 0, as before reopening existed).
   */
  function ticket(uid: string, role: MeetingRoomRole, adm: boolean, options: TicketOptions = {}) {
    const issued = Date.now();
    const { mid = meetingId, ttlMs = MEETING_ROOM_TOKEN_TTL_MS, gen } = options;
    return signMeetingToken(
      { v: 1, kind: "room", mid, uid, name: `Smoke ${uid}`, role, adm, ...(gen ? { gen } : {}), iat: issued, exp: issued + ttlMs },
      SECRET
    );
  }

  /**
   * One proxy call, shaped like the call UI's partytracks fetch: JSON string body, the ticket from
   * the media session's start in `?token=` and the CURRENT (refreshed) ticket as
   * `Authorization: Bearer` (src/lib/meetings/client/media-session.ts). A plain string is both.
   */
  async function proxy(path: string, auth: ProxyAuth, method: string, body?: unknown, origin: string | null = ORIGIN): Promise<Reply> {
    const { query, bearer } = typeof auth === "string" ? { query: auth, bearer: auth } : auth;
    const headers: Record<string, string> = { Authorization: `Bearer ${bearer}` };
    if (origin) headers.Origin = origin;
    const response = await fetch(`${prefix}${path}?${new URLSearchParams({ token: query })}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    try {
      return { status: response.status, body: JSON.parse(text) as Json };
    } catch {
      return { status: response.status, body: { raw: text.slice(0, 200) } };
    }
  }

  function openSocket(token: string, origin: string | null = ORIGIN) {
    return RoomSocket.open(`${ROOM_URL.replace(/^http/, "ws")}/rooms/${meetingId}/ws?${new URLSearchParams({ token })}`, origin);
  }

  /** A Portal -> room event (POST /internal/rooms/<id>/events, Bearer internal token from "portal"). */
  async function event(body: MeetingRoomEvent) {
    const token = await signMeetingInternalToken("portal", meetingId, SECRET);
    const response = await fetch(`${ROOM_URL}/internal/rooms/${meetingId}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return response.status;
  }

  /** Portal -> room `ended`: closes sockets, clears the room's storage and stops the `empty` alarm. */
  const end = () => event({ t: "ended" });

  return { meetingId, prefix, ticket, proxy, openSocket, event, end };
}

/** Like the browser's RoomSocket (src/lib/meetings/client/room-socket.ts): `{"t":"ping"}` every 20 s. */
const PING_INTERVAL_MS = 20_000;

export class RoomSocket {
  readonly messages: MeetingServerMessage[] = [];
  /** Closes of this socket: `ours` is true when this side closed or terminated it. */
  readonly closes: { at: number; code: number; reason: string; ours: boolean }[] = [];
  lastMessageAt = now();
  private closing = false;
  private waiters: { match: (m: MeetingServerMessage) => boolean; resolve: (m: MeetingServerMessage) => void }[] = [];
  private listeners: ((m: MeetingServerMessage) => void)[] = [];
  private pinger: ReturnType<typeof setInterval>;

  private constructor(readonly ws: WebSocket) {
    this.pinger = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "ping" }));
    }, PING_INTERVAL_MS);
    ws.on("close", (code, reason) => {
      clearInterval(this.pinger);
      this.closes.push({ at: now(), code, reason: String(reason), ours: this.closing });
    });
    ws.on("message", (data) => {
      this.lastMessageAt = now();
      const message = JSON.parse(String(data)) as MeetingServerMessage;
      this.messages.push(message);
      this.listeners.forEach((listener) => listener(message));
      this.waiters = this.waiters.filter((waiter) => (waiter.match(message) ? (waiter.resolve(message), false) : true));
    });
  }

  /** Resolves with the open socket, or rejects with the HTTP status of a refused upgrade. */
  static open(url: string, origin: string | null): Promise<RoomSocket> {
    const ws = new WebSocket(url, { headers: origin ? { Origin: origin } : {} });
    const socket = new RoomSocket(ws);
    return new Promise((resolve, reject) => {
      const fail = (error: Error) => {
        clearInterval(socket.pinger);
        reject(error);
      };
      ws.once("open", () => resolve(socket));
      ws.once("unexpected-response", (req, res) => {
        req.destroy();
        fail(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode }));
      });
      ws.once("error", fail);
    });
  }

  next<T extends MeetingServerMessage>(match: (m: MeetingServerMessage) => m is T, what: string): Promise<T> {
    const seen = this.messages.find(match);
    if (seen) return Promise.resolve(seen);
    const waiter = new Promise<T>((resolve) => this.waiters.push({ match, resolve: resolve as (m: MeetingServerMessage) => void }));
    return timeout(waiter, STEP_TIMEOUT_MS, what);
  }

  /** Calls `listener` once when the socket closes. */
  onClose(listener: (close: { at: number; code: number; reason: string; ours: boolean }) => void) {
    this.ws.once("close", () => listener(this.closes[this.closes.length - 1]!));
  }

  /** Calls `listener` for every message, past and future. */
  onMessage(listener: (m: MeetingServerMessage) => void) {
    this.messages.forEach(listener);
    this.listeners.push(listener);
  }

  get isOpen() {
    return this.ws.readyState === WebSocket.OPEN;
  }

  send(message: unknown) {
    if (this.isOpen) this.ws.send(JSON.stringify(message));
  }

  close() {
    this.closing = true;
    clearInterval(this.pinger);
    this.ws.close(1000, "smoke done");
  }

  /** A network blip: drop the TCP connection without a close handshake. */
  terminate() {
    this.closing = true;
    clearInterval(this.pinger);
    this.ws.terminate();
  }
}

export const isWelcome = (m: MeetingServerMessage): m is Extract<MeetingServerMessage, { t: "welcome" }> => m.t === "welcome";

// ---------------------------------------------------------------------------
// Peer connections (partytracks call sequence)
// ---------------------------------------------------------------------------

/** Chrome-like offer: Opus + VP8 (NACK, PLI, transport-cc), mid / abs-send-time / transport-cc extensions. */
export function newPeer(iceServers: Json[], options: { relay?: boolean; full?: boolean } = {}) {
  const extensions = options.full ? [sdesMidExtension(), absSendTimeExtension(), transportCcExtension()] : [sdesMidExtension()];
  const video = options.full ? vp8Codec({ rtcpFeedback: [nackFeedback(), pliFeedback(), twccFeedback()] }) : vp8Codec();
  return new RTCPeerConnection({
    iceServers: iceServers as never,
    iceTransportPolicy: options.relay ? "relay" : "all",
    bundlePolicy: "max-bundle",
    codecs: { audio: [opusCodec()], video: [video] },
    headerExtensions: { audio: extensions, video: extensions }
  });
}

export function waitConnected(pc: RTCPeerConnection, who: string) {
  if (pc.connectionState === "connected") return Promise.resolve();
  return timeout(
    new Promise<void>((resolve, reject) => {
      pc.connectionStateChange.subscribe((state) => {
        if (state === "connected") resolve();
        if (state === "failed" || state === "closed") reject(new Error(`${who} peer connection ${state}`));
      });
    }),
    STEP_TIMEOUT_MS,
    `${who} peer connection`
  );
}

export type SelectedPair = { local: string; protocol: string; remote: string };

export async function selectedPair(pc: RTCPeerConnection): Promise<SelectedPair | null> {
  const report = (await pc.getStats()) as unknown as Map<string, Json>;
  const stats = [...report.values()];
  const transport = stats.find((s) => s.type === "transport" && s.selectedCandidatePairId);
  const pair =
    stats.find((s) => s.type === "candidate-pair" && s.id === transport?.selectedCandidatePairId) ??
    stats.find((s) => s.type === "candidate-pair" && s.nominated);
  if (!pair) return null;
  const local = stats.find((s) => s.id === pair.localCandidateId);
  const remote = stats.find((s) => s.id === pair.remoteCandidateId);
  return { local: local?.candidateType ?? "?", protocol: local?.protocol ?? "?", remote: remote?.candidateType ?? "?" };
}

export function describePair(pair: SelectedPair | null) {
  return pair ? `local ${pair.local}/${pair.protocol} -> remote ${pair.remote}` : "unknown";
}

/** The TURN URL werift uses: the first `turn:` URL in the list (see werift parseIceServers). */
export function firstTurnUrl(iceServers: Json[]) {
  const urls = iceServers.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls])) as string[];
  return urls.find((url) => url.startsWith("turn:")) ?? null;
}

/** partytracks closeTrackInBulk: stop, new offer, PUT tracks/close, apply the answer. */
export async function closeTracks(room: RoomClient, pc: RTCPeerConnection, sessionId: string, token: ProxyAuth, transceivers: RTCRtpTransceiver[]) {
  const mids = transceivers.map((t) => ({ mid: t.mid as string }));
  transceivers.forEach((t) => t.stop());
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const reply = await room.proxy(`/sessions/${sessionId}/tracks/close`, token, "PUT", {
    tracks: mids,
    sessionDescription: { sdp: pc.localDescription?.sdp, type: "offer" },
    force: false
  });
  if (isOk(reply.status) && reply.body.sessionDescription) await pc.setRemoteDescription(reply.body.sessionDescription);
  return reply;
}
