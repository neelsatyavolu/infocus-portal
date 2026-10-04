/**
 * Meetings E2EE primitives (pure; WebCrypto only). Shared by the call UI, the Scribe page and the
 * unit tests. `public/meet-e2ee-worker.js` mirrors the frame format byte for byte, and a test
 * checks the two interoperate.
 *
 * Frame layout: clearHeader || ciphertext+tag(16) || iv(12) || epoch(1 = epoch mod 256),
 * AES-GCM-256 with AAD = clearHeader. The clear header keeps the codec payload header readable so
 * the SFU and depacketizer still work: VP8 key frame 10 bytes, VP8 delta frame 3, audio (Opus TOC) 1.
 */

export const MEET_HKDF_SALT = "infocus-meet-v1";
export const FRAME_IV_BYTES = 12;
export const FRAME_TAG_BYTES = 16;
/** Bytes appended after the ciphertext: iv + epoch byte. */
export const FRAME_TRAILER_BYTES = FRAME_IV_BYTES + 1;
export const FRAME_OVERHEAD_BYTES = FRAME_TAG_BYTES + FRAME_TRAILER_BYTES;

export type MediaFrameKind = "audio" | "video";
export type KeyPurpose = "frame" | "chat";

const encoder = new TextEncoder();

export function clearHeaderLength(kind: MediaFrameKind, isKeyFrame: boolean) {
  if (kind === "audio") return 1;
  return isKeyFrame ? 10 : 3;
}

export function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** HKDF-SHA256(roomKey, salt "infocus-meet-v1", info purpose) → AES-GCM-256 key. */
export async function deriveMeetingKey(rawRoomKey: Uint8Array<ArrayBuffer>, purpose: KeyPurpose) {
  if (rawRoomKey.byteLength !== 32) throw new Error("Meeting key must be 32 bytes.");
  const base = await crypto.subtle.importKey("raw", rawRoomKey, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: encoder.encode(MEET_HKDF_SALT), info: encoder.encode(purpose) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export function epochByte(epoch: number) {
  return ((epoch % 256) + 256) % 256;
}

/** Encrypts one encoded frame. Frames shorter than the header stay entirely in the header. */
export async function encryptFrame(
  key: CryptoKey,
  epoch: number,
  frame: ArrayBuffer,
  headerLength: number,
  iv: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(FRAME_IV_BYTES))
): Promise<ArrayBuffer> {
  const data = new Uint8Array(frame);
  const header = data.subarray(0, Math.min(headerLength, data.byteLength));
  const plain = data.subarray(header.byteLength);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: header }, key, plain)
  );
  const out = new Uint8Array(header.byteLength + sealed.byteLength + FRAME_TRAILER_BYTES);
  out.set(header, 0);
  out.set(sealed, header.byteLength);
  out.set(iv, header.byteLength + sealed.byteLength);
  out[out.byteLength - 1] = epochByte(epoch);
  return out.buffer;
}

/** Reads the epoch byte of an encrypted frame, or null when it is too short to be one. */
export function frameEpochByte(frame: ArrayBuffer) {
  if (frame.byteLength < FRAME_OVERHEAD_BYTES) return null;
  return new Uint8Array(frame)[frame.byteLength - 1];
}

/**
 * Decrypts one frame. `keyForEpoch` returns the key for the trailing epoch byte (or undefined when
 * that epoch is unknown). Returns null when the frame can't be decrypted; callers drop it.
 */
export async function decryptFrame(
  keyForEpoch: (epochByte: number) => CryptoKey | undefined,
  frame: ArrayBuffer,
  headerLength: number
): Promise<ArrayBuffer | null> {
  const epoch = frameEpochByte(frame);
  if (epoch === null) return null;
  const key = keyForEpoch(epoch);
  if (!key) return null;
  const data = new Uint8Array(frame);
  const sealedEnd = data.byteLength - FRAME_TRAILER_BYTES;
  const header = data.subarray(0, Math.min(headerLength, sealedEnd - FRAME_TAG_BYTES));
  const sealed = data.subarray(header.byteLength, sealedEnd);
  const iv = data.slice(sealedEnd, sealedEnd + FRAME_IV_BYTES);
  try {
    const plain = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: header }, key, sealed)
    );
    const out = new Uint8Array(header.byteLength + plain.byteLength);
    out.set(header, 0);
    out.set(plain, header.byteLength);
    return out.buffer;
  } catch {
    return null;
  }
}
