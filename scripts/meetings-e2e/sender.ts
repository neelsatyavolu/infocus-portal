/**
 * Real-time media sender for one push session: frames are scheduled on a fixed clock (drift =
 * actual - scheduled), sealed with the participant's current send key, then packetized.
 *
 * Idle (camera off + muted) mirrors what partytracks sends then: an inaudible oscillator track
 * (Opus silence, still 50 packets/s) and a black canvas repainted once a second (~1 fps, tiny frames).
 * Back on, the first video frame is a key frame, as after a source switch.
 */
import { RtpHeader, RtpPacket, type RTCRtpTransceiver } from "werift";
import { encryptFrame } from "../../src/lib/meetings/client/frame-crypto";
import type { Kind } from "./common";
import type { FrameKey } from "./keys";
import { AUDIO_FRAME_MS, audioFrameBytes, headerLengthOf, packetizeVp8, plainFrame, VIDEO_FPS, videoFrameSizes } from "./media";

export type SentFrame = { counter: number; sentAt: number; drift: number; bytes: number };

export type SenderContext = {
  pushed: Record<Kind, RTCRtpTransceiver>;
  /** Frame counters start here (unique per media session). */
  counterBase: number;
  videoKbps: number;
  keyFrameSeconds: number;
  sendKey: () => FrameKey;
  record: (kind: Kind, frame: SentFrame) => void;
  onError: (message: string) => void;
  /** A key frame sent because the SFU asked (PLI/FIR). */
  onKeyFrameRequest: () => void;
};

export type Sender = { stop: () => void; setIdle: (idle: boolean) => void };

const PLI_COUNT = 1;
const FIR_COUNT = 4;
const MIN_PLI_KEYFRAME_GAP_MS = 500;
/** Sealed sizes while idle: Opus silence + E2EE overhead, and black-canvas VP8 frames. */
const IDLE_AUDIO_BYTES = 48;
const IDLE_VIDEO_BYTES = { key: 1200, delta: 200 };

export function startSender(ctx: SenderContext): Sender {
  const { pushed } = ctx;
  const keyEvery = Math.round(ctx.keyFrameSeconds * VIDEO_FPS);
  const sizes = videoFrameSizes(ctx.videoKbps, keyEvery);
  const seq = { audio: 0, video: 0 };
  let chains: Record<Kind, Promise<void>> = { audio: Promise.resolve(), video: Promise.resolve() };
  let forceKey = false;
  let lastKeyAt = 0;
  let idle = false;
  pushed.video.sender.onRtcp.subscribe((packet) => {
    const count = (packet as { type: number; feedback?: { count?: number } }).feedback?.count;
    if (packet.type === 206 && (count === PLI_COUNT || count === FIR_COUNT)) forceKey = true;
  });

  const sendPackets = async (kind: Kind, payloads: Buffer[], timestamp: number) => {
    for (const [i, payload] of payloads.entries()) {
      const header = new RtpHeader({ payloadType: 96, sequenceNumber: seq[kind] & 0xffff, timestamp: timestamp >>> 0, marker: i === payloads.length - 1 });
      seq[kind] += 1;
      await pushed[kind].sender.sendRtp(new RtpPacket(header, payload));
    }
  };

  const videoSize = (n: number, isKey: boolean) => {
    if (idle) return isKey ? IDLE_VIDEO_BYTES.key : IDLE_VIDEO_BYTES.delta;
    return isKey ? sizes.key : Math.round(sizes.delta * (0.9 + ((n * 7919) % 21) / 100));
  };

  const sendFrame = async (kind: Kind, n: number, scheduled: number) => {
    let bytes = idle ? IDLE_AUDIO_BYTES : audioFrameBytes(n);
    let isKey = false;
    if (kind === "video") {
      const at = performance.now();
      isKey = n % keyEvery === 0 || (forceKey && at - lastKeyAt > MIN_PLI_KEYFRAME_GAP_MS);
      if (isKey && n % keyEvery !== 0) ctx.onKeyFrameRequest();
      if (isKey) {
        forceKey = false;
        lastKeyAt = at;
      }
      bytes = videoSize(n, isKey);
    }
    const counter = ctx.counterBase + n;
    const { frame: plain, sentAt } = plainFrame(kind, counter, bytes, isKey);
    const key = ctx.sendKey();
    const sealed = new Uint8Array(await encryptFrame(key.key, key.epoch, plain.buffer, headerLengthOf(kind, plain)));
    ctx.record(kind, { counter, sentAt, drift: performance.now() - scheduled, bytes: sealed.byteLength });
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
        const n = next[kind];
        const scheduled = start + n * interval[kind];
        next[kind] += 1;
        // Idle video: the black canvas only produces a frame about once a second.
        if (kind === "video" && idle && n % VIDEO_FPS !== 0) continue;
        chains = {
          ...chains,
          [kind]: chains[kind].then(() => sendFrame(kind, n, scheduled)).catch((error: Error) => ctx.onError(`send ${kind}: ${error.message}`))
        };
      }
    }
  }, 2);

  return {
    stop: () => clearInterval(timer),
    setIdle: (value: boolean) => {
      if (idle && !value) forceKey = true;
      idle = value;
    }
  };
}
