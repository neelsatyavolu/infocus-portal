/**
 * One test participant: joins the room socket, opens ONE partytracks session (like the browser),
 * pushes E2EE audio + VP8 video at real-time pace (sender.ts), and pulls every other participant's
 * tracks the way the call UI does, recording per-track arrival data for the metrics.
 *
 * Browser behaviours mirrored here:
 * - join: useMeetingCall.connect (fresh ticket, new socket); media starts after the admitted welcome;
 * - socket drop: RoomSocket reconnects with the SAME ticket and jittered backoff; the new welcome
 *   starts a fresh PartyTracks session and the old one is closed (useMeetingCall.startMedia);
 * - pulls: media-elements.tsx usePulledTrack keyed by sessionId/trackName, batched while a
 *   negotiation is in flight (patches/partytracks+0.0.56.patch);
 * - keys: MeetingE2ee + key-ring.ts (keys.ts), rekey fetched from the Portal after the room's `rekey`;
 * - tickets: TicketManager (src/lib/meetings/client/ticket.ts) refreshes at 75% of the lifetime and
 *   before a reconnect with under 10 min left; proxy calls send it as `Authorization: Bearer`;
 * - a socket the room closes (deploy, network) reconnects like RoomSocket unless the code is final.
 */
import { randomUUID } from "node:crypto";
import type { MediaStreamTrack, RTCPeerConnection, RTCRtpTransceiver } from "werift";
import { decryptFrame } from "../../src/lib/meetings/client/frame-crypto";
import { backoffDelay } from "../../src/lib/meetings/client/room-socket";
import { decodeTicket, needsRefreshBeforeConnect, refreshAt } from "../../src/lib/meetings/client/ticket";
import type { MeetingParticipantView, MeetingServerMessage, MeetingTrackMetadata } from "../../src/lib/meetings/protocol";
import {
  closeTracks,
  describe,
  isOk,
  isWelcome,
  newPeer,
  now,
  selectedPair,
  sleep,
  waitConnected,
  type Json,
  type Kind,
  type Reply,
  type RoomClient,
  type RoomSocket,
  type SelectedPair
} from "./common";
import { FrameKeys, type FrameKey } from "./keys";
import { headerLengthOf, parsePlainFrame, Vp8Reassembler } from "./media";
import { startSender, type Sender, type SentFrame } from "./sender";

export type { SentFrame } from "./sender";
export type AudioIn = { counter: number; sentAt: number; arrival: number; epoch: number };
export type VideoIn = { counter: number; sentAt: number; arrival: number; bytes: number };
export type Inbound = {
  publisher: string;
  /** When this receiver saw the publisher's tracks in a room message. */
  seenAt: number;
  pullRequestAt: number;
  audio: AudioIn[];
  video: VideoIn[];
  decryptFailures: number;
  /** Arrival time of every frame that failed to decrypt. */
  failureTimes: number[];
  integrityFailures: string[];
};

export type ParticipantOptions = {
  room: RoomClient;
  uid: string;
  role: "host" | "member";
  /** Epoch-0 meeting frame key. */
  key: CryptoKey;
  relay: boolean;
  videoKbps: number;
  keyFrameSeconds: number;
  /** Room ticket lifetime (default: the Portal's 4 h). */
  ticketTtlMs?: number;
  /** Room generation on the tickets (absent = 0). */
  ticketGen?: number;
  /** Refresh tickets like the browser's TicketManager (default true). False = an un-refreshed client. */
  refreshTickets?: boolean;
  /** The Portal's GET /key after a room `rekey` (the browser refetches, then setKey with rekey: true). */
  fetchKey?: (epoch: number) => Promise<FrameKey>;
  /** Called with a short line for anything that went wrong outside the measured path. */
  log: (line: string) => void;
  /** Every room message this participant receives (for scenario logs). */
  onRoomMessage?: (uid: string, message: MeetingServerMessage) => void;
};

/** One pulled remote track, keyed like media-elements.tsx usePulledTrack: `${sessionId}/${trackName}`. */
type Pull = { key: string; transceiver?: RTCRtpTransceiver };
type Wanted = { uid: string; kind: Kind; key: string; meta: { location: "remote"; sessionId: string; trackName: string } };

const metaKey = (meta: MeetingTrackMetadata | undefined) => (meta?.sessionId && meta.trackName ? `${meta.sessionId}/${meta.trackName}` : null);
/** Frame counters restart per media session; offset them so they stay unique across rejoins. */
export const GENERATION_STRIDE = 1_000_000;
/**
 * Default "dequeue" mirrors the patched partytracks: pulls that arrive while a negotiation is in
 * flight share the next request. E2E_PULL_BATCH=tick is stock partytracks (same tick only).
 */
const PULL_AT_DEQUEUE = process.env.E2E_PULL_BATCH !== "tick";
/** Portal GET /key latency after a `rekey` (random in this range). */
const KEY_FETCH_MS = [100, 400] as const;

export type ReconnectResult = { ok: boolean; attempts: number; statuses: number[] };

/** Room close codes after which RoomSocket never reconnects (removed, denied, ended, full). */
const FINAL_CLOSE_CODES = new Set([4003, 4004, 4010, 4029]);

export class Participant {
  readonly uid: string;
  /** The current room ticket (TicketManager.current). */
  token = "";
  /** The ticket when the current media session started (partytracks' apiExtraParams `?token=`). */
  private sessionToken = "";
  private refreshTimer?: ReturnType<typeof setTimeout>;
  /** Ticket refreshes (epoch ms). */
  readonly refreshes: number[] = [];
  /** Socket reconnects: why, when, and how they went. */
  readonly reconnects: { at: number; reason: string; result: ReconnectResult }[] = [];
  private reconnecting = false;
  socket?: RoomSocket;
  pc?: RTCPeerConnection;
  sessionId?: string;
  iceServers: Json[] = [];
  pair: SelectedPair | null = null;
  readonly times = { ticketAt: 0, welcomeAt: 0, pushRequestAt: 0, answerAt: 0, connectedAt: 0, announcedAt: 0 };
  /** Proxy round-trip times (ms) by route, e.g. "tracks/new push". */
  readonly calls = new Map<string, number[]>();
  /** Every proxy call (time, route, HTTP status), for rate-limit accounting. */
  readonly callLog: { at: number; route: string; status: number }[] = [];
  /** Tracks per tracks/new pull request. */
  readonly pullBatches: number[] = [];
  /** Each pull negotiation: tracks/new -> renegotiate answered, and the PC's transceivers before it. */
  readonly pullTimes: { at: number; ms: number; transceivers: number }[] = [];
  /** Room `error` messages (e.g. the per-socket message rate limit). */
  readonly roomErrors: { at: number; message: string }[] = [];
  readonly sent: Record<Kind, SentFrame[]> = { audio: [], video: [] };
  readonly inbound = new Map<string, Inbound>();
  readonly errors: string[] = [];
  keyFramesOnRequest = 0;
  /** Media sessions this uid has created, oldest first (to spot stale tracks in room messages). */
  readonly sessions: string[] = [];
  /** Every socket this participant opened (closed ones keep their close log). */
  readonly sockets: RoomSocket[] = [];
  generation = 0;
  readonly keys: FrameKeys;
  /** What the negotiation queue is doing now (E2E_DEBUG shows anything stuck). */
  step = { what: "idle", since: 0 };
  private pushed?: Record<Kind, RTCRtpTransceiver>;
  private queue: Promise<unknown> = Promise.resolve();
  private sender?: Sender;
  /** Mirror of the client's room reducer: welcome replaces, participant upserts, left removes. */
  private roomView: Record<string, MeetingParticipantView> = {};
  /** `${uid}:${kind}` -> current pull. */
  private pulls = new Map<string, Pull>();
  private pendingPulls: Wanted[] = [];

  constructor(private readonly options: ParticipantOptions) {
    this.uid = options.uid;
    this.keys = new FrameKeys({ epoch: 0, key: options.key });
  }

  /** Serializes negotiations on the one peer connection (partytracks' FIFO task scheduler). */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private trace(what: string) {
    this.step = { what, since: now() };
  }

  private async call(path: string, method: string, body?: unknown, route = path.replace(/^\/sessions\/[^/]+\//, "")): Promise<Reply> {
    const started = performance.now();
    const reply = await this.options.room.proxy(path, this.auth(), method, body);
    this.calls.set(route, [...(this.calls.get(route) ?? []), performance.now() - started]);
    this.callLog.push({ at: now(), route, status: reply.status });
    if (!isOk(reply.status) || reply.body.errorCode) throw new Error(`${this.uid} ${method} ${path.replace(/[A-Za-z0-9]{20,}/g, ":id")}: ${describe(reply)}`);
    return reply;
  }

  private auth() {
    return { query: this.sessionToken || this.token, bearer: this.token };
  }

  private get refreshing() {
    return this.options.refreshTickets !== false;
  }

  private mintTicket() {
    return this.options.room.ticket(this.uid, this.options.role, true, { ttlMs: this.options.ticketTtlMs, gen: this.options.ticketGen });
  }

  /** TicketManager.refresh: POST /ticket mints a fresh ticket (same uid/role/adm, new iat/exp). */
  async refreshTicket() {
    this.token = await this.mintTicket();
    this.refreshes.push(now());
    this.scheduleRefresh();
  }

  /** TicketManager.apply: the next refresh at 75% of the ticket's lifetime. */
  private scheduleRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const ticket = decodeTicket(this.token);
    if (!this.refreshing || !ticket) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTicket().catch((error: Error) => this.errors.push(`${this.uid} refresh: ${error.message}`));
    }, Math.max(1000, refreshAt(ticket) - Date.now()));
    this.refreshTimer.unref();
  }

  private stopRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  /**
   * useMeetingCall.connect: a fresh ticket (new iat) unless `reuseToken` (RoomSocket's own reconnect,
   * which goes through TicketManager.forConnect: refresh first when under 10 minutes are left).
   */
  async join(options: { reuseToken?: boolean } = {}) {
    const { room } = this.options;
    this.times.ticketAt = now();
    if (!options.reuseToken || !this.token) {
      this.token = await this.mintTicket();
      this.scheduleRefresh();
    } else if (this.refreshing && needsRefreshBeforeConnect(this.token, Date.now())) {
      await this.refreshTicket();
    }
    const socket = await room.openSocket(this.token);
    this.generation += 1;
    this.queue = Promise.resolve();
    this.pulls = new Map();
    this.pendingPulls = [];
    this.roomView = {};
    this.pc = undefined;
    this.sessionId = undefined;
    this.socket = socket;
    this.sockets.push(socket);
    socket.onMessage((message) => this.onRoomMessage(message));
    socket.onClose((close) => {
      if (close.ours || socket !== this.socket || FINAL_CLOSE_CODES.has(close.code)) return;
      void this.reconnect(`room closed ${close.code}`);
    });
    const welcome = await socket.next(isWelcome, `${this.uid} welcome`);
    this.times.welcomeAt = now();
    if (!welcome.self.admitted) throw new Error(`${this.uid} not admitted`);
  }

  async publish() {
    const ice = await this.call("/generate-ice-servers", "GET");
    this.iceServers = Array.isArray(ice.body.iceServers) ? ice.body.iceServers : [];
    this.sessionToken = this.token;
    const sessionId = (await this.call("/sessions/new", "POST")).body.sessionId as string;
    this.sessions.push(sessionId);
    const pc = newPeer(this.iceServers, { relay: this.options.relay, full: true });
    const pushed = {
      audio: pc.addTransceiver("audio", { direction: "sendonly" }),
      video: pc.addTransceiver("video", { direction: "sendonly" })
    };
    this.pushed = pushed;
    const names = { audio: randomUUID(), video: randomUUID() };
    const pushDone = this.enqueue(async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.times.pushRequestAt = now();
      const reply = await this.call(`/sessions/${sessionId}/tracks/new`, "POST", {
        sessionDescription: { sdp: offer.sdp, type: "offer" },
        tracks: (["audio", "video"] as const).map((kind) => ({ trackName: names[kind], mid: pushed[kind].mid, location: "local" }))
      }, "tracks/new push");
      await pc.setRemoteDescription(reply.body.sessionDescription);
      this.times.answerAt = now();
    });
    // The session exists: pulls for everyone already announced queue up behind the push.
    this.pc = pc;
    this.sessionId = sessionId;
    this.reconcile();
    await pushDone;
    await waitConnected(pc, this.uid);
    this.times.connectedAt = now();
    this.pair = await selectedPair(pc);
    this.sender = startSender({
      pushed,
      counterBase: this.generation * GENERATION_STRIDE,
      videoKbps: this.options.videoKbps,
      keyFrameSeconds: this.options.keyFrameSeconds,
      sendKey: () => this.keys.sendKey(),
      record: (kind, frame) => this.sent[kind].push(frame),
      onError: (message) => this.errors.push(`${this.uid} ${message}`),
      onKeyFrameRequest: () => (this.keyFramesOnRequest += 1)
    });

    // use-publish.ts wire shape: partytracks drops mid, the client sends mid: null.
    const wire = (kind: Kind): MeetingTrackMetadata => ({ location: "remote", sessionId, trackName: names[kind], mid: null });
    this.times.announcedAt = now();
    this.socket!.send({ t: "tracks", tracks: { audio: wire("audio"), video: wire("video") } });
    this.socket!.send({ t: "media", audioOn: true, videoOn: true, screenOn: false });
  }

  private onRoomMessage(message: MeetingServerMessage) {
    this.options.onRoomMessage?.(this.uid, message);
    if (message.t === "error") this.roomErrors.push({ at: now(), message: message.message });
    if (message.t === "rekey") this.onRekey(message.epoch);
    if (isWelcome(message)) this.roomView = Object.fromEntries(message.participants.map((p) => [p.uid, p]));
    else if (message.t === "participant") this.roomView = { ...this.roomView, [message.participant.uid]: message.participant };
    else if (message.t === "left") this.roomView = Object.fromEntries(Object.entries(this.roomView).filter(([uid]) => uid !== message.uid));
    else return;
    if (process.env.E2E_DEBUG === "2") {
      const about = message.t === "participant" ? `${message.participant.uid} ${Object.keys(message.participant.tracks).join("+") || "no tracks"}` : message.t === "left" ? message.uid : "";
      this.options.log(`debug2 ${this.uid} <- ${message.t} ${about}; pc ${this.pc ? "yes" : "no"}`);
    }
    this.reconcile();
  }

  /** useMeetingCall `rekey`: fetch the new key from the Portal, then setKey(..., { rekey: true }). */
  private onRekey(epoch: number) {
    const fetchKey = this.options.fetchKey;
    if (!fetchKey) return;
    const delay = KEY_FETCH_MS[0] + Math.random() * (KEY_FETCH_MS[1] - KEY_FETCH_MS[0]);
    void sleep(delay)
      .then(() => fetchKey(epoch))
      .then((entry) => this.keys.add(entry, true))
      .catch((error: Error) => this.errors.push(`${this.uid} rekey: ${error.message}`));
  }

  private inboundFor(uid: string) {
    const existing = this.inbound.get(uid);
    if (existing) return existing;
    const inbound: Inbound = { publisher: uid, seenAt: now(), pullRequestAt: 0, audio: [], video: [], decryptFailures: 0, failureTimes: [], integrityFailures: [] };
    this.inbound.set(uid, inbound);
    return inbound;
  }

  /**
   * What the call UI does on every room-state change: one usePulledTrack per remote uid and kind,
   * keyed by sessionId/trackName. A changed key unsubscribes the old pull (partytracks closes its
   * transceiver with tracks/close) and pulls the new one; a `left` uid unmounts (close only).
   */
  private reconcile() {
    if (!this.pc || !this.sessionId) return;
    const closes: RTCRtpTransceiver[] = [];
    for (const [id, pull] of this.pulls) {
      const [uid, kind] = id.split(":") as [string, Kind];
      if (metaKey(this.roomView[uid]?.tracks[kind]) === pull.key) continue;
      this.pulls.delete(id);
      if (pull.transceiver) closes.push(pull.transceiver);
    }
    const wanted: Wanted[] = [];
    for (const view of Object.values(this.roomView)) {
      if (view.uid === this.uid) continue;
      for (const kind of ["audio", "video"] as const) {
        const meta = view.tracks[kind];
        const key = metaKey(meta);
        if (!key || this.pulls.get(`${view.uid}:${kind}`)?.key === key) continue;
        this.pulls.set(`${view.uid}:${kind}`, { key });
        this.inboundFor(view.uid); // stamps seenAt now, before any negotiation-queue wait
        wanted.push({ uid: view.uid, kind, key, meta: { location: "remote", sessionId: meta!.sessionId!, trackName: meta!.trackName! } });
      }
    }
    const pc = this.pc;
    const sessionId = this.sessionId;
    if (closes.length) {
      this.enqueue(async () => {
        if (pc.connectionState !== "connected") return; // partytracks bails the same way
        await closeTracks(this.options.room, pc, sessionId, this.auth(), closes);
      }).catch((error: Error) => this.errors.push(`${this.uid} close: ${error.message}`));
    }
    if (!wanted.length) return;
    if (!PULL_AT_DEQUEUE) {
      this.enqueue(() => this.pull(pc, sessionId, wanted)).catch((error: Error) => this.errors.push(error.message));
      return;
    }
    const waiting = this.pendingPulls.length > 0;
    this.pendingPulls.push(...wanted);
    if (waiting) return;
    this.enqueue(() => this.pull(pc, sessionId, this.pendingPulls.splice(0))).catch((error: Error) => this.errors.push(error.message));
  }

  /** partytracks pullTrackInBulk: tracks/new (remote), then the SFU's offer, our answer, PUT renegotiate. */
  private async pull(pc: RTCPeerConnection, sessionId: string, wanted: Wanted[]) {
    if (pc !== this.pc || !wanted.length) return;
    for (const w of wanted) {
      const inbound = this.inboundFor(w.uid);
      if (!inbound.pullRequestAt) inbound.pullRequestAt = now();
    }
    this.pullBatches.push(wanted.length);
    const started = now();
    const transceiversBefore = pc.getTransceivers().length;
    this.trace(`pull x${wanted.length}: tracks/new`);
    const reply = await this.call(`/sessions/${sessionId}/tracks/new`, "POST", { tracks: wanted.map((w) => w.meta) }, "tracks/new pull");
    const failed = ((reply.body.tracks ?? []) as Json[]).filter((t) => t.errorCode);
    if (failed.length) this.errors.push(`${this.uid} pull: ${failed.map((t) => `${t.errorCode} ${t.errorDescription ?? ""}`).join(", ")}`);
    if (reply.body.requiresImmediateRenegotiation) {
      this.trace("pull: setRemoteDescription");
      await pc.setRemoteDescription(reply.body.sessionDescription);
      this.trace("pull: createAnswer");
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.trace("pull: renegotiate");
      await this.call(`/sessions/${sessionId}/renegotiate`, "PUT", { sessionDescription: { type: "answer", sdp: pc.localDescription?.sdp } });
    }
    this.pullTimes.push({ at: started, ms: now() - started, transceivers: transceiversBefore });
    for (const w of wanted) {
      const mid = ((reply.body.tracks ?? []) as Json[]).find((t) => t.trackName === w.meta.trackName && t.sessionId === w.meta.sessionId)?.mid as string | undefined;
      const transceiver = pc.getTransceivers().find((t) => t.mid === mid);
      if (!transceiver) {
        this.errors.push(`${this.uid} pull ${w.uid} ${w.kind}: no transceiver`);
        continue;
      }
      const pull = this.pulls.get(`${w.uid}:${w.kind}`);
      if (pull?.key === w.key) pull.transceiver = transceiver;
      this.trace(`pull: track for mid ${mid}`);
      const track = await this.trackOf(transceiver);
      if (w.kind === "audio") this.receiveAudio(track, this.inboundFor(w.uid));
      else this.receiveVideo(track, this.inboundFor(w.uid));
    }
    this.trace("idle");
  }

  private async trackOf(transceiver: RTCRtpTransceiver): Promise<MediaStreamTrack> {
    for (let i = 0; i < 250; i += 1) {
      // werift reuses the transceiver when the SFU recycles a mid and appends a track for the new
      // SSRC, so the newest track is the live one (a browser makes a fresh transceiver instead).
      const track = transceiver.receiver.tracks.at(-1);
      if (track) return track;
      await sleep(20);
    }
    throw new Error(`${this.uid}: no receiver track on mid ${transceiver.mid}`);
  }

  private async open(kind: Kind, sealed: Uint8Array<ArrayBuffer>, inbound: Inbound, arrival: number) {
    const plain = await decryptFrame((byte) => this.keys.forEpochByte(byte), sealed.buffer, headerLengthOf(kind, sealed));
    if (!plain) {
      inbound.decryptFailures += 1;
      inbound.failureTimes.push(arrival);
      return null;
    }
    const parsed = parsePlainFrame(kind, new Uint8Array(plain));
    if (!parsed.ok) {
      if (inbound.integrityFailures.length < 5) inbound.integrityFailures.push(parsed.reason);
      return null;
    }
    return parsed;
  }

  private receiveAudio(track: MediaStreamTrack, inbound: Inbound) {
    const seen = new Set<number>();
    track.onReceiveRtp.subscribe(async (rtp) => {
      const arrival = now();
      if (seen.has(rtp.header.sequenceNumber)) return;
      seen.add(rtp.header.sequenceNumber);
      if (seen.size > 4096) seen.clear();
      const sealed = Uint8Array.from(rtp.payload);
      const parsed = await this.open("audio", sealed, inbound, arrival);
      if (parsed) inbound.audio.push({ counter: parsed.counter, sentAt: parsed.sentAt, arrival, epoch: sealed[sealed.byteLength - 1]! });
    });
  }

  private receiveVideo(track: MediaStreamTrack, inbound: Inbound) {
    const reassembler = new Vp8Reassembler(async (sealed, _first, arrival) => {
      const parsed = await this.open("video", Uint8Array.from(sealed), inbound, arrival);
      if (parsed) inbound.video.push({ counter: parsed.counter, sentAt: parsed.sentAt, arrival, bytes: sealed.byteLength });
    });
    track.onReceiveRtp.subscribe((rtp) => {
      reassembler.push(rtp.header.timestamp, rtp.header.sequenceNumber, rtp.header.marker, rtp.payload, now());
    });
  }

  stop() {
    this.sender?.stop();
  }

  /** Camera off + muted (partytracks keeps sending its fallback tracks), or back on. */
  setIdle(idle: boolean) {
    this.sender?.setIdle(idle);
    this.socket?.send({ t: "media", audioOn: !idle, videoOn: !idle, screenOn: false });
  }

  /** Transceivers in the current peer connection (werift keeps stopped ones in the list). */
  transceiverCount() {
    const all = this.pc?.getTransceivers() ?? [];
    return { total: all.length, active: all.filter((t) => !t.stopped && t.currentDirection !== "inactive").length };
  }

  /** A fresh MeetingE2ee after a full rejoin holds only the current key. */
  resetKeys(entry: FrameKey) {
    this.keys.reset(entry);
  }

  /** Closes every pushed and pulled track in one tracks/close, then the peer connection and the socket. */
  async leave(): Promise<string | null> {
    this.stop();
    this.stopRefresh();
    let result: string | null = null;
    const pc = this.pc;
    const pulled = [...this.pulls.values()].flatMap((pull) => (pull.transceiver ? [pull.transceiver] : []));
    const transceivers = [...(this.pushed ? [this.pushed.audio, this.pushed.video] : []), ...pulled];
    if (pc && this.sessionId && transceivers.length && pc.connectionState === "connected") {
      const reply = await this.enqueue(() => closeTracks(this.options.room, pc, this.sessionId!, this.auth(), transceivers)).catch(
        (error: Error) => ({ status: 0, body: { error: error.message } })
      );
      result = describe(reply);
      if (!isOk(reply.status)) this.options.log(`${this.uid} tracks/close: ${result}`);
    }
    await pc?.close().catch(() => undefined);
    this.socket?.close();
    return result;
  }

  /**
   * A reconnect where the new socket opens BEFORE the old one closes: join + publish with a fresh
   * ticket while the old socket, peer connection and sender stay up for `overlapMs`, then drop them.
   */
  async rejoinOverlapping(overlapMs: number) {
    const old = { socket: this.socket, pc: this.pc, sender: this.sender };
    const started = now();
    await this.join();
    await this.publish();
    await sleep(Math.max(0, overlapMs - (now() - started)));
    old.sender?.stop();
    old.socket?.close();
    await old.pc?.close().catch(() => undefined);
  }

  /**
   * A network blip: the socket dies without a close handshake. Like RoomSocket, reconnect with the
   * SAME ticket after jittered backoff until `giveUpMs`; media keeps running meanwhile. On the new
   * welcome, useMeetingCall.startMedia replaces the media session (old one closed, re-push, re-pull).
   */
  async blipAndReconnect(giveUpMs = 30_000): Promise<ReconnectResult> {
    this.socket?.terminate();
    return this.reconnect("blip", giveUpMs);
  }

  /** RoomSocket's reconnect loop after the socket is gone, then a fresh media session on the new welcome. */
  private async reconnect(reason: string, giveUpMs = 30_000): Promise<ReconnectResult> {
    if (this.reconnecting) return { ok: false, attempts: 0, statuses: [] };
    this.reconnecting = true;
    const at = now();
    const result = await this.reconnectLoop(giveUpMs).finally(() => (this.reconnecting = false));
    this.reconnects.push({ at, reason, result });
    return result;
  }

  private async reconnectLoop(giveUpMs: number): Promise<ReconnectResult> {
    const old = { pc: this.pc, sender: this.sender };
    const deadline = now() + giveUpMs;
    const statuses: number[] = [];
    for (let attempt = 0; now() < deadline; attempt += 1) {
      await sleep(backoffDelay(attempt));
      try {
        await this.join({ reuseToken: true });
      } catch (error) {
        statuses.push((error as { status?: number }).status ?? 0);
        continue;
      }
      old.sender?.stop();
      await old.pc?.close().catch(() => undefined);
      await this.publish();
      return { ok: true, attempts: attempt + 1, statuses };
    }
    return { ok: false, attempts: statuses.length, statuses };
  }

  /** useMeetingCall.leave(): send {t:"leave"} and flush, then tear down socket and media (no tracks/close). */
  async leaveLikeBrowser() {
    this.stop();
    this.stopRefresh();
    const socket = this.socket;
    if (socket?.isOpen) {
      await new Promise<void>((resolve) => socket.ws.send(JSON.stringify({ t: "leave" }), () => resolve()));
      socket.close();
    }
    const pc = this.pc;
    this.pc = undefined;
    this.sessionId = undefined;
    this.pulls = new Map();
    this.roomView = {};
    await pc?.close().catch(() => undefined);
  }
}
