/**
 * One load-test participant: joins the room socket, opens ONE partytracks session (like the browser),
 * pushes E2EE audio + VP8 video at real-time pace, and pulls every other participant's tracks as
 * they are announced, recording per-track arrival data for metrics.ts.
 */
import { randomUUID } from "node:crypto";
import { RtpHeader, RtpPacket, type MediaStreamTrack, type RTCPeerConnection, type RTCRtpTransceiver } from "werift";
import { decryptFrame, encryptFrame } from "../../src/lib/meetings/client/frame-crypto";
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
import {
  AUDIO_FRAME_MS,
  audioFrameBytes,
  headerLengthOf,
  packetizeVp8,
  parsePlainFrame,
  plainFrame,
  VIDEO_FPS,
  videoFrameSizes,
  Vp8Reassembler
} from "./media";

export type SentFrame = { counter: number; sentAt: number; drift: number; bytes: number };
export type AudioIn = { counter: number; sentAt: number; arrival: number };
export type VideoIn = { counter: number; sentAt: number; arrival: number; bytes: number };
export type Inbound = {
  publisher: string;
  /** When this receiver saw the publisher's tracks in a room message. */
  seenAt: number;
  pullRequestAt: number;
  audio: AudioIn[];
  video: VideoIn[];
  decryptFailures: number;
  integrityFailures: string[];
};

export type ParticipantOptions = {
  room: RoomClient;
  uid: string;
  role: "host" | "member";
  key: CryptoKey;
  relay: boolean;
  videoKbps: number;
  keyFrameSeconds: number;
  /** Called with a short line for anything that went wrong outside the measured path. */
  log: (line: string) => void;
  /** Every room message this participant receives (for scenario logs). */
  onRoomMessage?: (uid: string, message: MeetingServerMessage) => void;
};

/** One pulled remote track, keyed like media-elements.tsx usePulledTrack: `${sessionId}/${trackName}`. */
type Pull = { key: string; transceiver?: RTCRtpTransceiver };

const metaKey = (meta: MeetingTrackMetadata | undefined) => (meta?.sessionId && meta.trackName ? `${meta.sessionId}/${meta.trackName}` : null);
/** Frame counters restart per media session; offset them so they stay unique across rejoins. */
const GENERATION_STRIDE = 1_000_000;
/**
 * E2E_PULL_BATCH=dequeue: batch every pull that arrives while a negotiation is in flight (the proposed
 * fix). Default "tick" mirrors partytracks: only pulls requested in the same tick share a request.
 */
const PULL_AT_DEQUEUE = process.env.E2E_PULL_BATCH === "dequeue";

type Wanted = { uid: string; kind: Kind; key: string; meta: { location: "remote"; sessionId: string; trackName: string } };

const PLI_COUNT = 1;
const FIR_COUNT = 4;
const MIN_PLI_KEYFRAME_GAP_MS = 500;

export class Participant {
  readonly uid: string;
  token = "";
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
  /** Tracks per tracks/new pull request (partytracks batches same-tick pulls into one). */
  readonly pullBatches: number[] = [];
  /** Room `error` messages (e.g. the per-socket message rate limit). */
  readonly roomErrors: string[] = [];
  readonly sent: Record<Kind, SentFrame[]> = { audio: [], video: [] };
  readonly inbound = new Map<string, Inbound>();
  readonly errors: string[] = [];
  keyFramesOnRequest = 0;
  /** Media sessions this uid has created, oldest first (to spot stale tracks in room messages). */
  readonly sessions: string[] = [];
  generation = 0;
  private pushed?: Record<Kind, RTCRtpTransceiver>;
  private queue: Promise<unknown> = Promise.resolve();
  private stopSending?: () => void;
  /** Mirror of the client's room reducer: welcome replaces, participant upserts, left removes. */
  private roomView: Record<string, MeetingParticipantView> = {};
  /** `${uid}:${kind}` -> current pull. */
  private pulls = new Map<string, Pull>();
  private pendingPulls: Wanted[] = [];

  constructor(private readonly options: ParticipantOptions) {
    this.uid = options.uid;
  }

  /** Serializes negotiations on the one peer connection (partytracks' FIFO task scheduler). */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async call(path: string, method: string, body?: unknown, route = path.replace(/^\/sessions\/[^/]+\//, "")): Promise<Reply> {
    const started = performance.now();
    const reply = await this.options.room.proxy(path, this.token, method, body);
    this.calls.set(route, [...(this.calls.get(route) ?? []), performance.now() - started]);
    this.callLog.push({ at: now(), route, status: reply.status });
    if (!isOk(reply.status) || reply.body.errorCode) throw new Error(`${this.uid} ${method} ${path.replace(/[A-Za-z0-9]{20,}/g, ":id")}: ${describe(reply)}`);
    return reply;
  }

  /** Fresh ticket (new iat), new socket; like useMeetingCall.connect(). */
  async join() {
    const { room } = this.options;
    this.generation += 1;
    this.queue = Promise.resolve();
    this.pulls = new Map();
    this.pendingPulls = [];
    this.roomView = {};
    this.pc = undefined;
    this.sessionId = undefined;
    this.times.ticketAt = now();
    this.token = await room.ticket(this.uid, this.options.role, true);
    this.socket = await room.openSocket(this.token);
    this.socket.onMessage((message) => this.onRoomMessage(message));
    const welcome = await this.socket.next(isWelcome, `${this.uid} welcome`);
    this.times.welcomeAt = now();
    if (!welcome.self.admitted) throw new Error(`${this.uid} not admitted`);
  }

  async publish() {
    const ice = await this.call("/generate-ice-servers", "GET");
    this.iceServers = Array.isArray(ice.body.iceServers) ? ice.body.iceServers : [];
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
    this.stopSending = this.startSending(pushed);

    // use-publish.ts wire shape: partytracks drops mid, the client sends mid: null.
    const wire = (kind: Kind): MeetingTrackMetadata => ({ location: "remote", sessionId, trackName: names[kind], mid: null });
    this.times.announcedAt = now();
    this.socket!.send({ t: "tracks", tracks: { audio: wire("audio"), video: wire("video") } });
    this.socket!.send({ t: "media", audioOn: true, videoOn: true, screenOn: false });
  }

  private onRoomMessage(message: MeetingServerMessage) {
    this.options.onRoomMessage?.(this.uid, message);
    if (message.t === "error") this.roomErrors.push(message.message);
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

  private inboundFor(uid: string) {
    const existing = this.inbound.get(uid);
    if (existing) return existing;
    const inbound: Inbound = { publisher: uid, seenAt: now(), pullRequestAt: 0, audio: [], video: [], decryptFailures: 0, integrityFailures: [] };
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
        await closeTracks(this.options.room, pc, sessionId, this.token, closes);
      }).catch((error: Error) => this.errors.push(`${this.uid} close: ${error.message}`));
    }
    if (!wanted.length) return;
    if (!PULL_AT_DEQUEUE) {
      this.enqueue(() => this.pull(pc, sessionId, wanted)).catch((error: Error) => this.errors.push(error.message));
      return;
    }
    // Proposed fix: keep collecting pulls until the negotiation queue is free, then send them as one.
    const waiting = this.pendingPulls.length > 0;
    this.pendingPulls.push(...wanted);
    if (waiting) return;
    this.enqueue(() => {
      const batch = this.pendingPulls.splice(0);
      return this.pull(pc, sessionId, batch);
    }).catch((error: Error) => this.errors.push(error.message));
  }

  /** partytracks pullTrackInBulk: tracks/new (remote), then the SFU's offer, our answer, PUT renegotiate. */
  private async pull(
    pc: RTCPeerConnection,
    sessionId: string,
    wanted: Wanted[]
  ) {
    if (pc !== this.pc) return;
    for (const w of wanted) {
      const inbound = this.inboundFor(w.uid);
      if (!inbound.pullRequestAt) inbound.pullRequestAt = now();
    }
    this.pullBatches.push(wanted.length);
    this.trace(`pull x${wanted.length}: tracks/new`);
    const reply = await this.call(`/sessions/${sessionId}/tracks/new`, "POST", { tracks: wanted.map((w) => w.meta) }, "tracks/new pull");
    const failed = ((reply.body.tracks ?? []) as Json[]).filter((t) => t.errorCode);
    if (failed.length) this.errors.push(`${this.uid} pull: ${failed.map((t) => `${t.errorCode} ${t.errorDescription ?? ""}`).join(", ")}`);
    if (reply.body.requiresImmediateRenegotiation) {
      this.trace("pull: setRemoteDescription");
      await pc.setRemoteDescription(reply.body.sessionDescription);
      this.trace("pull: createAnswer");
      const answer = await pc.createAnswer();
      this.trace("pull: setLocalDescription");
      await pc.setLocalDescription(answer);
      this.trace("pull: renegotiate");
      await this.call(`/sessions/${sessionId}/renegotiate`, "PUT", { sessionDescription: { type: "answer", sdp: pc.localDescription?.sdp } });
    }
    for (const w of wanted) {
      const mid = ((reply.body.tracks ?? []) as Json[]).find((t) => t.trackName === w.meta.trackName && t.sessionId === w.meta.sessionId)?.mid as string | undefined;
      const transceiver = pc.getTransceivers().find((t) => t.mid === mid);
      if (!transceiver) {
        this.errors.push(`${this.uid} pull ${w.uid} ${w.kind}: no transceiver`);
        continue;
      }
      const pull = this.pulls.get(`${w.uid}:${w.kind}`);
      if (pull?.key === w.key) pull.transceiver = transceiver;
      if (process.env.E2E_DEBUG === "2") {
        const sameMid = pc.getTransceivers().filter((t) => t.mid === mid).length;
        this.options.log(`debug ${this.uid} pulled ${w.uid} ${w.kind}: mid ${mid}, transceivers with that mid ${sameMid}, stopped ${transceiver.stopped}, direction ${transceiver.currentDirection}, total ${pc.getTransceivers().length}`);
      }
      this.trace(`pull: track for mid ${mid}`);
      const track = await this.trackOf(transceiver);
      if (w.kind === "audio") this.receiveAudio(track, this.inboundFor(w.uid));
      else this.receiveVideo(track, this.inboundFor(w.uid));
    }
    this.trace("idle");
  }

  /** What the negotiation queue is doing now (E2E_DEBUG shows anything stuck). */
  step = { what: "idle", since: 0 };
  private trace(what: string) {
    this.step = { what, since: now() };
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

  private async open(kind: Kind, sealed: Uint8Array<ArrayBuffer>, inbound: Inbound) {
    const plain = await decryptFrame((epoch) => (epoch === 0 ? this.options.key : undefined), sealed.buffer, headerLengthOf(kind, sealed));
    if (!plain) {
      inbound.decryptFailures += 1;
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
      const parsed = await this.open("audio", Uint8Array.from(rtp.payload), inbound);
      if (parsed) inbound.audio.push({ counter: parsed.counter, sentAt: parsed.sentAt, arrival });
    });
  }

  private receiveVideo(track: MediaStreamTrack, inbound: Inbound) {
    const reassembler = new Vp8Reassembler(async (sealed, _first, arrival) => {
      const parsed = await this.open("video", Uint8Array.from(sealed), inbound);
      if (parsed) inbound.video.push({ counter: parsed.counter, sentAt: parsed.sentAt, arrival, bytes: sealed.byteLength });
    });
    track.onReceiveRtp.subscribe((rtp) => {
      reassembler.push(rtp.header.timestamp, rtp.header.sequenceNumber, rtp.header.marker, rtp.payload, now());
    });
  }

  // ---------------------------------------------------------------------------
  // Real-time sender: frames are scheduled on a fixed clock; drift = actual - scheduled
  // ---------------------------------------------------------------------------

  private startSending(pushed: Record<Kind, RTCRtpTransceiver>) {
    const keyEvery = Math.round(this.options.keyFrameSeconds * VIDEO_FPS);
    const sizes = videoFrameSizes(this.options.videoKbps, keyEvery);
    const rtp = { audio: { seq: 0 }, video: { seq: 0 } };
    const chains: Record<Kind, Promise<void>> = { audio: Promise.resolve(), video: Promise.resolve() };
    const sender = pushed.video.sender;
    let forceKey = false;
    let lastKeyAt = 0;
    sender.onRtcp.subscribe((packet) => {
      const count = (packet as { type: number; feedback?: { count?: number } }).feedback?.count;
      if (packet.type === 206 && (count === PLI_COUNT || count === FIR_COUNT)) forceKey = true;
    });

    const sendPackets = async (kind: Kind, payloads: Buffer[], timestamp: number) => {
      for (const [i, payload] of payloads.entries()) {
        const header = new RtpHeader({ payloadType: 96, sequenceNumber: rtp[kind].seq & 0xffff, timestamp: timestamp >>> 0, marker: i === payloads.length - 1 });
        rtp[kind].seq += 1;
        await pushed[kind].sender.sendRtp(new RtpPacket(header, payload));
      }
    };

    const base = this.generation * GENERATION_STRIDE;
    const sendFrame = async (kind: Kind, n: number, scheduled: number) => {
      const counter = base + n;
      let bytes = audioFrameBytes(n);
      let isKey = false;
      if (kind === "video") {
        const at = performance.now();
        isKey = n % keyEvery === 0 || (forceKey && at - lastKeyAt > MIN_PLI_KEYFRAME_GAP_MS);
        if (isKey && n % keyEvery !== 0) this.keyFramesOnRequest += 1;
        if (isKey) {
          forceKey = false;
          lastKeyAt = at;
        }
        bytes = isKey ? sizes.key : Math.round(sizes.delta * (0.9 + ((n * 7919) % 21) / 100));
      }
      const { frame: plain, sentAt } = plainFrame(kind, counter, bytes, isKey);
      const sealed = new Uint8Array(await encryptFrame(this.options.key, 0, plain.buffer, headerLengthOf(kind, plain)));
      this.sent[kind].push({ counter, sentAt, drift: performance.now() - scheduled, bytes: sealed.byteLength });
      if (kind === "audio") await sendPackets("audio", [Buffer.from(sealed)], n * 960);
      else await sendPackets("video", packetizeVp8(sealed, n & 0x7fff), n * (90_000 / VIDEO_FPS));
    };

    const start = performance.now();
    const next = { audio: 0, video: 0 };
    const interval = { audio: AUDIO_FRAME_MS, video: 1000 / VIDEO_FPS };
    const timer = setInterval(() => {
      const at = performance.now();
      for (const kind of ["audio", "video"] as const) {
        while (start + next[kind] * interval[kind] <= at) {
          const counter = next[kind];
          const scheduled = start + counter * interval[kind];
          next[kind] += 1;
          chains[kind] = chains[kind].then(() => sendFrame(kind, counter, scheduled)).catch((error: Error) => {
            this.errors.push(`${this.uid} send ${kind}: ${error.message}`);
          });
        }
      }
    }, 2);
    return () => clearInterval(timer);
  }

  stop() {
    this.stopSending?.();
  }

  /** Closes every pushed and pulled track in one tracks/close, then the peer connection and the socket. */
  async leave(): Promise<string | null> {
    this.stop();
    let result: string | null = null;
    const pc = this.pc;
    const pulled = [...this.pulls.values()].flatMap((pull) => (pull.transceiver ? [pull.transceiver] : []));
    const transceivers = [...(this.pushed ? [this.pushed.audio, this.pushed.video] : []), ...pulled];
    if (pc && this.sessionId && transceivers.length && pc.connectionState === "connected") {
      const reply = await this.enqueue(() => closeTracks(this.options.room, pc, this.sessionId!, this.token, transceivers)).catch(
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
    const old = { socket: this.socket, pc: this.pc, stop: this.stopSending };
    this.stopSending = undefined;
    const started = now();
    await this.join();
    await this.publish();
    await sleep(Math.max(0, overlapMs - (now() - started)));
    old.stop?.();
    old.socket?.close();
    await old.pc?.close().catch(() => undefined);
  }

  /** useMeetingCall.leave(): send {t:"leave"} and flush, then tear down socket and media (no tracks/close). */
  async leaveLikeBrowser() {
    this.stop();
    const socket = this.socket;
    if (socket) {
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
