import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FRAME_OVERHEAD_BYTES,
  clearHeaderLength,
  decryptFrame,
  deriveMeetingKey,
  encryptFrame,
  fromBase64Url,
  toBase64Url
} from "@/src/lib/meetings/client/frame-crypto";
import { addKeyToRing, emptyKeyRing, keyForEpochByte, type KeyRing } from "@/src/lib/meetings/client/key-ring";

type WorkerApi = {
  deriveFrameKey: (raw: Uint8Array) => Promise<CryptoKey>;
  encryptFrame: (key: CryptoKey, epoch: number, frame: ArrayBuffer, hdr: number, iv?: Uint8Array) => Promise<ArrayBuffer>;
  decryptFrame: (lookup: (byte: number) => CryptoKey | undefined, frame: ArrayBuffer, hdr: number) => Promise<ArrayBuffer | null>;
  headerLength: (kind: string, isKeyFrame: boolean) => number;
  sendEpoch: (now: number) => number | null;
  setKeyForTest: (epoch: number, key: CryptoKey, now: number, delayMs: number) => void;
};

function loadWorker(): WorkerApi {
  const source = readFileSync(path.join(process.cwd(), "public/meet-e2ee-worker.js"), "utf8");
  const scope: Record<string, unknown> = { postMessage: () => undefined };
  new Function("self", source)(scope);
  return scope.__meetE2ee as WorkerApi;
}

function roomKey(seed: number) {
  return new Uint8Array(32).map((_, i) => (i * 7 + seed) % 256);
}

function frameBytes(length: number, seed = 1) {
  return new Uint8Array(length).map((_, i) => (i * 31 + seed) % 256);
}

async function ringWith(...epochs: Array<[number, number]>) {
  let ring: KeyRing<CryptoKey> = emptyKeyRing();
  for (const [epoch, seed] of epochs) {
    ring = addKeyToRing(ring, { epoch, key: await deriveMeetingKey(roomKey(seed), "frame") });
  }
  return ring;
}

describe("frame crypto", () => {
  it("uses the spec header sizes", () => {
    expect(clearHeaderLength("video", true)).toBe(10);
    expect(clearHeaderLength("video", false)).toBe(3);
    expect(clearHeaderLength("audio", false)).toBe(1);
  });

  it.each([
    ["VP8 key frame", clearHeaderLength("video", true), 1200],
    ["VP8 delta frame", clearHeaderLength("video", false), 400],
    ["audio frame", clearHeaderLength("audio", false), 80]
  ])("round-trips a %s and leaves the header clear", async (_label, header, length) => {
    const ring = await ringWith([3, 1]);
    const plain = frameBytes(length);
    const sealed = new Uint8Array(await encryptFrame(ring.current!.key, 3, plain.buffer, header));

    expect(sealed.byteLength).toBe(length + FRAME_OVERHEAD_BYTES);
    expect(Array.from(sealed.subarray(0, header))).toEqual(Array.from(plain.subarray(0, header)));
    expect(Array.from(sealed.subarray(header, header + 16))).not.toEqual(Array.from(plain.subarray(header, header + 16)));
    expect(sealed[sealed.byteLength - 1]).toBe(3);

    const opened = await decryptFrame((byte) => keyForEpochByte(ring, byte), sealed.buffer, header);
    expect(opened).not.toBeNull();
    expect(Array.from(new Uint8Array(opened!))).toEqual(Array.from(plain));
  });

  it("handles frames shorter than the header", async () => {
    const ring = await ringWith([0, 1]);
    const plain = frameBytes(2);
    const sealed = await encryptFrame(ring.current!.key, 0, plain.buffer, 10);
    const opened = await decryptFrame((byte) => keyForEpochByte(ring, byte), sealed, 10);
    expect(Array.from(new Uint8Array(opened!))).toEqual([...plain]);
  });

  it("fails when the ciphertext or the clear header is tampered with", async () => {
    const ring = await ringWith([1, 1]);
    const sealed = new Uint8Array(await encryptFrame(ring.current!.key, 1, frameBytes(300).buffer, 3));
    const lookup = (byte: number) => keyForEpochByte(ring, byte);

    const body = sealed.slice();
    body[20] ^= 0xff;
    expect(await decryptFrame(lookup, body.buffer, 3)).toBeNull();

    const header = sealed.slice();
    header[0] ^= 0x01;
    expect(await decryptFrame(lookup, header.buffer, 3)).toBeNull();
  });

  it("drops frames from an unknown epoch and decrypts the previous one after a rekey", async () => {
    const oldRing = await ringWith([4, 1]);
    const sealedOld = await encryptFrame(oldRing.current!.key, 4, frameBytes(200).buffer, 3);

    const rotated = await ringWith([4, 1], [5, 2]);
    expect(await decryptFrame((b) => keyForEpochByte(rotated, b), sealedOld, 3)).not.toBeNull();

    const twiceRotated = await ringWith([4, 1], [5, 2], [6, 3]);
    expect(await decryptFrame((b) => keyForEpochByte(twiceRotated, b), sealedOld, 3)).toBeNull();

    const strangerRing = await ringWith([4, 9]);
    expect(await decryptFrame((b) => keyForEpochByte(strangerRing, b), sealedOld, 3)).toBeNull();
  });

  it("drops frames too short to carry a tag", async () => {
    const ring = await ringWith([0, 1]);
    expect(await decryptFrame((b) => keyForEpochByte(ring, b), new Uint8Array(10).buffer, 1)).toBeNull();
  });

  it("round-trips base64url", () => {
    const bytes = frameBytes(33, 200);
    expect(Array.from(fromBase64Url(toBase64Url(bytes)))).toEqual(Array.from(bytes));
  });

  it("rejects room keys that are not 32 bytes", async () => {
    await expect(deriveMeetingKey(new Uint8Array(16), "frame")).rejects.toThrow();
  });
});

describe("e2ee worker interop", () => {
  const worker = loadWorker();

  it("uses the same header sizes", () => {
    expect(worker.headerLength("video", true)).toBe(10);
    expect(worker.headerLength("video", false)).toBe(3);
    expect(worker.headerLength("audio", false)).toBe(1);
  });

  it("produces byte-identical frames for the same key and IV", async () => {
    const iv = new Uint8Array(12).fill(7);
    const plain = frameBytes(500);
    const tsKey = await deriveMeetingKey(roomKey(1), "frame");
    const workerKey = await worker.deriveFrameKey(roomKey(1));
    const fromTs = new Uint8Array(await encryptFrame(tsKey, 300, plain.buffer, 10, iv));
    const fromWorker = new Uint8Array(await worker.encryptFrame(workerKey, 300, plain.buffer, 10, iv));
    expect(Array.from(fromWorker)).toEqual(Array.from(fromTs));
  });

  it("decrypts worker frames in TS and TS frames in the worker", async () => {
    const plain = frameBytes(120);
    const tsKey = await deriveMeetingKey(roomKey(2), "frame");
    const workerKey = await worker.deriveFrameKey(roomKey(2));

    const sealedByWorker = await worker.encryptFrame(workerKey, 2, plain.buffer, 1);
    const openedInTs = await decryptFrame((b) => (b === 2 ? tsKey : undefined), sealedByWorker, 1);
    expect(Array.from(new Uint8Array(openedInTs!))).toEqual(Array.from(plain));

    const sealedByTs = await encryptFrame(tsKey, 2, plain.buffer, 3);
    const openedInWorker = await worker.decryptFrame((b) => (b === 2 ? workerKey : undefined), sealedByTs, 3);
    expect(Array.from(new Uint8Array(openedInWorker!))).toEqual(Array.from(plain));
    expect(await worker.decryptFrame(() => undefined, sealedByTs, 3)).toBeNull();
  });

  it("mirrors the rekey send grace: old epoch for 2 s, then the new one", async () => {
    const fresh = loadWorker();
    const k0 = await fresh.deriveFrameKey(roomKey(1));
    const k1 = await fresh.deriveFrameKey(roomKey(2));
    fresh.setKeyForTest(0, k0, 1000, 0);
    expect(fresh.sendEpoch(1000)).toBe(0);
    fresh.setKeyForTest(1, k1, 5000, 2000);
    expect(fresh.sendEpoch(6999)).toBe(0);
    expect(fresh.sendEpoch(7000)).toBe(1);
  });
});
