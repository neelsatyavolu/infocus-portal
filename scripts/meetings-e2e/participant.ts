/**
 * One load-test participant: joins the room socket, opens ONE partytracks session (like the browser),
 * pushes E2EE audio + VP8 video at real-time pace, and pulls every other participant's tracks as
 * they are announced, recording per-track arrival data for metrics.ts.
 */
import { randomUUID } from "node:crypto";
import { RtpHeader, RtpPacket, type MediaStreamTrack, type RTCPeerConnection, type RTCRtpTransceiver } from "werift";
import { decryptFrame, encryptFrame } from "../../src/lib/meetings/client/frame-crypto";
import type { MeetingParticipantView, MeetingTrackMetadata } from "../../src/lib/meetings/protocol";
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
};

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
  readonly sent: Record<Kind, SentFrame[]> = { audio: [], video: [] };
  readonly inbound = new Map<string, Inbound>();
  readonly errors: string[] = [];
  keyFramesOnRequest = 0;
  private pushed?: Record<Kind, RTCRtpTransceiver>;
  private pulled: RTCRtpTransceiver[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private stopSending?: () => void;

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
    if (!isOk(reply.status) || reply.body.errorCode) throw new Error(`${this.uid} ${method} ${path.replace(/[A-Za-z0-9]{20,}/g, ":id")}: ${describe(reply)}`);
    return reply;
  }

  async join() {
    const { room } = this.options;
    this.times.ticketAt = now();
    this.token = await room.ticket(this.uid, this.options.role, true);
    this.socket = await room.openSocket(this.token);
    const welcome = await this.socket.next(isWelcome, `${this.uid} welcome`);
    this.times.welcomeAt = now();
    if (!welcome.self.admitted) throw new Error(`${this.uid} not admitted`);
  }

  async publish() {
    const ice = await this.call("/generate-ice-servers", "GET");
    this.iceServers = Array.isArray(ice.body.iceServers) ? ice.body.iceServers : [];
    this.sessionId = (await this.call("/sessions/new", "POST")).body.sessionId as string;
    const pc = (this.pc = newPeer(this.iceServers, { relay: this.options.relay, full: true }));
    const pushed = {
      audio: pc.addTransceiver("audio", { direction: "sendonly" }),
      video: pc.addTransceiver("video", { direction: "sendonly" })
    };
    this.pushed = pushed;
    const names = { audio: randomUUID(), video: randomUUID() };
    await this.enqueue(async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.times.pushRequestAt = now();
      const reply = await this.call(`/sessions/${this.sessionId}/tracks/new`, "POST", {
        sessionDescription: { sdp: offer.sdp, type: "offer" },
        tracks: (["audio", "video"] as const).map((kind) => ({ trackName: names[kind], mid: pushed[kind].mid, location: "local" }))
      }, "tracks/new push");
      await pc.setRemoteDescription(reply.body.sessionDescription);
      this.times.answerAt = now();
    });
    await waitConnected(pc, this.uid);
    this.times.connectedAt = now();
    this.pair = await selectedPair(pc);
    this.stopSending = this.startSending(pushed);

    // use-publish.ts wire shape: partytracks drops mid, the client sends mid: null.
    const wire = (kind: Kind): MeetingTrackMetadata => ({ location: "remote", sessionId: this.sessionId, trackName: names[kind], mid: null });
    this.times.announcedAt = now();
    this.socket!.send({ t: "tracks", tracks: { audio: wire("audio"), video: wire("video") } });
    this.socket!.send({ t: "media", audioOn: true, videoOn: true, screenOn: false });
    this.socket!.onMessage((message) => {
      if (isWelcome(message)) message.participants.forEach((p) => this.maybePull(p));
      if (message.t === "participant") this.maybePull(message.participant);
    });
  }

  private maybePull(view: MeetingParticipantView) {
    const { audio, video } = view.tracks;
    if (view.uid === this.uid || this.inbound.has(view.uid) || !audio?.sessionId || !video?.sessionId) return;
    const inbound: Inbound = { publisher: view.uid, seenAt: now(), pullRequestAt: 0, audio: [], video: [], decryptFailures: 0, integrityFailures: [] };
    this.inbound.set(view.uid, inbound);
    this.enqueue(() => this.pull(inbound, { audio, video })).catch((error: Error) => this.errors.push(error.message));
  }

  /** partytracks pullTrackInBulk: tracks/new (remote), then the SFU's offer, our answer, PUT renegotiate. */
  private async pull(inbound: Inbound, tracks: Record<Kind, MeetingTrackMetadata>) {
    const pc = this.pc!;
    inbound.pullRequestAt = now();
    const reply = await this.call(`/sessions/${this.sessionId}/tracks/new`, "POST", { tracks: [tracks.audio, tracks.video] }, "tracks/new pull");
    const failed = ((reply.body.tracks ?? []) as Json[]).filter((t) => t.errorCode);
    if (failed.length) throw new Error(`${this.uid} pull ${inbound.publisher}: ${failed.map((t) => t.errorCode).join(",")}`);
    if (reply.body.requiresImmediateRenegotiation) {
      await pc.setRemoteDescription(reply.body.sessionDescription);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.call(`/sessions/${this.sessionId}/renegotiate`, "PUT", { sessionDescription: { type: "answer", sdp: pc.localDescription?.sdp } });
    }
    for (const kind of ["audio", "video"] as const) {
      const mid = ((reply.body.tracks ?? []) as Json[]).find((t) => t.trackName === tracks[kind].trackName)?.mid as string | undefined;
      const transceiver = pc.getTransceivers().find((t) => t.mid === mid);
      if (!transceiver) throw new Error(`${this.uid} pull ${inbound.publisher}: no transceiver for ${kind}`);
      this.pulled.push(transceiver);
      const track = await this.trackOf(transceiver);
      if (kind === "audio") this.receiveAudio(track, inbound);
      else this.receiveVideo(track, inbound);
    }
  }

  private async trackOf(transceiver: RTCRtpTransceiver): Promise<MediaStreamTrack> {
    for (let i = 0; i < 250; i += 1) {
      const track = transceiver.receiver.tracks[0];
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

    const sendFrame = async (kind: Kind, counter: number, scheduled: number) => {
      let bytes = audioFrameBytes(counter);
      let isKey = false;
      if (kind === "video") {
        const at = performance.now();
        isKey = counter % keyEvery === 0 || (forceKey && at - lastKeyAt > MIN_PLI_KEYFRAME_GAP_MS);
        if (isKey && counter % keyEvery !== 0) this.keyFramesOnRequest += 1;
        if (isKey) {
          forceKey = false;
          lastKeyAt = at;
        }
        bytes = isKey ? sizes.key : Math.round(sizes.delta * (0.9 + ((counter * 7919) % 21) / 100));
      }
      const { frame: plain, sentAt } = plainFrame(kind, counter, bytes, isKey);
      const sealed = new Uint8Array(await encryptFrame(this.options.key, 0, plain.buffer, headerLengthOf(kind, plain)));
      this.sent[kind].push({ counter, sentAt, drift: performance.now() - scheduled, bytes: sealed.byteLength });
      if (kind === "audio") await sendPackets("audio", [Buffer.from(sealed)], counter * 960);
      else await sendPackets("video", packetizeVp8(sealed, counter & 0x7fff), counter * (90_000 / VIDEO_FPS));
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
    const transceivers = [...(this.pushed ? [this.pushed.audio, this.pushed.video] : []), ...this.pulled];
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
}
