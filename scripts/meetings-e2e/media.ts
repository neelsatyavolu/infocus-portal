/**
 * Fake but realistically shaped media for the terminal Meetings tests.
 *
 * Frames are E2EE-sealed exactly like the browser's frame transform (src/lib/meetings/client/frame-crypto.ts:
 * clear header, AES-GCM body, iv, epoch byte) BEFORE packetization, as the browser encrypts whole
 * encoded frames and the packetizer splits the ciphertext.
 *
 * Plaintext body after the clear codec header: magic u32 | kind u8 | counter u32 | sentAt f64 (epoch ms)
 * | padding where byte i = (counter + i) & 0xff, so the receiver can check every byte.
 */
import type { Kind } from "./common";

export const AUDIO_FRAME_MS = 20;
export const VIDEO_FPS = 30;
/** Max RTP payload (descriptor + data), like Chrome's ~1200-byte packets. */
export const MAX_RTP_PAYLOAD = 1200;
/** Encrypted-frame overhead: GCM tag 16 + iv 12 + epoch 1. */
export const SEAL_OVERHEAD = 29;
const MAGIC = 0x494e4645; // "INFE"
const BODY_HEADER = 17;
const AUDIO_TOC = 0x78; // Opus TOC: config 15 (hybrid FB 20 ms), mono, one frame
const VP8_DESCRIPTOR_BYTES = 4; // X | I with a 15-bit PictureID, like Chrome

/** Same rule as the E2EE worker: audio 1 clear byte, VP8 key frame 10, delta 3. */
export function headerLengthOf(kind: Kind, frame: Uint8Array) {
  if (kind === "audio") return 1;
  return (frame[0]! & 0x01) === 0 ? 10 : 3;
}

function vp8Header(isKey: boolean, firstPartitionSize: number): number[] {
  const size = firstPartitionSize & 0x7ffff;
  const tag = [(isKey ? 0 : 1) | (1 << 4) | ((size & 0x7) << 5), (size >> 3) & 0xff, (size >> 11) & 0xff];
  // Key frame: start code 9d 01 2a, then 1280x720 (14-bit little-endian width/height, scale 0).
  return isKey ? [...tag, 0x9d, 0x01, 0x2a, 0x00, 0x05, 0xd0, 0x02] : tag;
}

/** A plaintext frame whose SEALED size is `sealedBytes`, and the send time embedded in it. */
export function plainFrame(kind: Kind, counter: number, sealedBytes: number, isKey = false): { frame: Uint8Array<ArrayBuffer>; sentAt: number } {
  const header = kind === "audio" ? [AUDIO_TOC] : vp8Header(isKey, Math.floor(sealedBytes / 4));
  const bodyLength = Math.max(BODY_HEADER, sealedBytes - SEAL_OVERHEAD - header.length);
  const out = Buffer.alloc(header.length + bodyLength);
  out.set(header, 0);
  const body = out.subarray(header.length);
  body.writeUInt32BE(MAGIC, 0);
  body.writeUInt8(kind === "audio" ? 1 : 2, 4);
  body.writeUInt32BE(counter, 5);
  const sentAt = performance.timeOrigin + performance.now();
  body.writeDoubleBE(sentAt, 9);
  for (let i = BODY_HEADER; i < body.length; i += 1) body[i] = (counter + i) & 0xff;
  return { frame: new Uint8Array(out.buffer, out.byteOffset, out.byteLength) as Uint8Array<ArrayBuffer>, sentAt };
}

export type ParsedBody = { ok: true; counter: number; sentAt: number } | { ok: false; reason: string };

/** Checks a decrypted frame end to end and returns its counter and send time. */
export function parsePlainFrame(kind: Kind, plain: Uint8Array): ParsedBody {
  const frame = Buffer.from(plain.buffer, plain.byteOffset, plain.byteLength);
  const body = frame.subarray(headerLengthOf(kind, frame));
  if (body.length < BODY_HEADER) return { ok: false, reason: "short" };
  if (body.readUInt32BE(0) !== MAGIC) return { ok: false, reason: "magic" };
  if (body.readUInt8(4) !== (kind === "audio" ? 1 : 2)) return { ok: false, reason: "kind" };
  const counter = body.readUInt32BE(5);
  for (let i = BODY_HEADER; i < body.length; i += 1) {
    if (body[i] !== ((counter + i) & 0xff)) return { ok: false, reason: "padding" };
  }
  return { ok: true, counter, sentAt: body.readDoubleBE(9) };
}

/** Sealed sizes for a target bitrate: key frames `keyRatio`× a delta frame, averaging `kbps` over a GOP. */
export function videoFrameSizes(kbps: number, keyEveryFrames: number, keyRatio = 3.5) {
  const perFrame = (kbps * 1000) / 8 / VIDEO_FPS;
  const delta = Math.round((perFrame * keyEveryFrames) / (keyRatio + keyEveryFrames - 1));
  return { delta, key: Math.round(delta * keyRatio) };
}

/**
 * Splits one sealed VP8 frame into RTP payloads (RFC 7741): X=1, I=1 with a 15-bit PictureID,
 * S=1 on the first packet only. The caller sets the marker bit on the last packet.
 */
export function packetizeVp8(sealed: Uint8Array, pictureId: number): Buffer[] {
  const chunk = MAX_RTP_PAYLOAD - VP8_DESCRIPTOR_BYTES;
  const payloads: Buffer[] = [];
  for (let offset = 0; offset < sealed.byteLength; offset += chunk) {
    const descriptor = [0x80 | (offset === 0 ? 0x10 : 0), 0x80, 0x80 | ((pictureId >> 8) & 0x7f), pictureId & 0xff];
    payloads.push(Buffer.concat([Buffer.from(descriptor), sealed.subarray(offset, offset + chunk)]));
  }
  return payloads;
}

/** Parses the VP8 RTP payload descriptor (RFC 7741 §4.2). */
export function parseVp8Descriptor(payload: Buffer): { start: boolean; data: Buffer } {
  const first = payload[0]!;
  let offset = 1;
  if (first & 0x80) {
    const ext = payload[1]!;
    offset = 2;
    if (ext & 0x80) offset += payload[offset]! & 0x80 ? 2 : 1; // I: PictureID (7 or 15 bits)
    if (ext & 0x40) offset += 1; // L: TL0PICIDX
    if (ext & 0x30) offset += 1; // T/K: TID/KEYIDX
  }
  return { start: (first & 0x10) !== 0 && (first & 0x07) === 0, data: payload.subarray(offset) };
}

export function stripVp8Descriptor(payload: Buffer): Buffer {
  return parseVp8Descriptor(payload).data;
}

/** Opus-sized sealed audio frame: 120-160 bytes. */
export function audioFrameBytes(counter: number) {
  return 120 + ((counter * 37) % 41);
}

type Pending = { start?: number; end?: number; parts: Map<number, Buffer>; firstArrival: number };

/**
 * Reassembles VP8 frames from RTP packets keyed by RTP timestamp. A frame is complete when the
 * S-bit packet, the marker packet and every sequence number between them have arrived.
 */
export class Vp8Reassembler {
  private pending = new Map<number, Pending>();
  private done = new Set<number>();

  constructor(private readonly onFrame: (sealed: Buffer, firstArrival: number, lastArrival: number) => void) {}

  push(timestamp: number, sequence: number, marker: boolean, payload: Buffer, arrival: number) {
    if (this.done.has(timestamp)) return;
    const { start, data } = parseVp8Descriptor(payload);
    const frame: Pending = this.pending.get(timestamp) ?? { parts: new Map(), firstArrival: arrival };
    if (frame.parts.has(sequence)) return;
    frame.parts.set(sequence, data);
    if (start) frame.start = sequence;
    if (marker) frame.end = sequence;
    this.pending.set(timestamp, frame);
    if (frame.start === undefined || frame.end === undefined) return;
    const count = ((frame.end - frame.start) & 0xffff) + 1;
    if (frame.parts.size < count) return;
    const ordered: Buffer[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = frame.parts.get((frame.start + i) & 0xffff);
      if (!part) return;
      ordered.push(part);
    }
    this.pending.delete(timestamp);
    this.done.add(timestamp);
    if (this.done.size > 512) this.done = new Set([...this.done].slice(-256));
    this.prune(arrival);
    this.onFrame(Buffer.concat(ordered), frame.firstArrival, arrival);
  }

  /** Drops frames still incomplete after 3 s (they count as lost). */
  private prune(at: number) {
    for (const [timestamp, frame] of this.pending) if (at - frame.firstArrival > 3000) this.pending.delete(timestamp);
  }
}
