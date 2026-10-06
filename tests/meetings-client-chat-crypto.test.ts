import { describe, expect, it } from "vitest";
import { MEETING_CHAT_MAX_CHARS, decryptChat, encryptChat } from "@/src/lib/meetings/client/chat-crypto";
import { deriveMeetingKey } from "@/src/lib/meetings/client/frame-crypto";
import {
  REKEY_SEND_DELAY_MS,
  addKeyToRing,
  emptyKeyRing,
  emptySendSchedule,
  keyForEpochByte,
  scheduleSendKey,
  settleSendKey
} from "@/src/lib/meetings/client/key-ring";

const roomKey = (seed: number) => new Uint8Array(32).map((_, i) => (i + seed) % 256);

const ctx = { meetingId: "m1", uid: "abby", id: "msg-1" };

describe("chat crypto", () => {
  it("round-trips text and tags the epoch", async () => {
    const key = await deriveMeetingKey(roomKey(1), "chat");
    const sealed = await encryptChat(key, 4, "Rundown is in the doc 🎬", ctx);
    expect(sealed.epoch).toBe(4);
    expect(sealed.ct).not.toContain("Rundown");
    expect(await decryptChat(key, sealed, ctx)).toBe("Rundown is in the doc 🎬");
  });

  it("binds the sender, meeting, epoch and message id", async () => {
    const key = await deriveMeetingKey(roomKey(1), "chat");
    const sealed = await encryptChat(key, 4, "hi", ctx);
    expect(await decryptChat(key, sealed, { ...ctx, uid: "otto" })).toBeNull();
    expect(await decryptChat(key, sealed, { ...ctx, meetingId: "m2" })).toBeNull();
    expect(await decryptChat(key, sealed, { ...ctx, id: "msg-2" })).toBeNull();
    expect(await decryptChat(key, { ...sealed, epoch: 5 }, ctx)).toBeNull();
  });

  it("uses a fresh IV per message", async () => {
    const key = await deriveMeetingKey(roomKey(1), "chat");
    const a = await encryptChat(key, 0, "same", ctx);
    const b = await encryptChat(key, 0, "same", ctx);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it("returns null for the wrong key, the frame key, or tampering", async () => {
    const chatKey = await deriveMeetingKey(roomKey(1), "chat");
    const frameKey = await deriveMeetingKey(roomKey(1), "frame");
    const otherKey = await deriveMeetingKey(roomKey(2), "chat");
    const sealed = await encryptChat(chatKey, 0, "hello", ctx);
    expect(await decryptChat(otherKey, sealed, ctx)).toBeNull();
    expect(await decryptChat(frameKey, sealed, ctx)).toBeNull();
    const flipped = sealed.ct.startsWith("A") ? `B${sealed.ct.slice(1)}` : `A${sealed.ct.slice(1)}`;
    expect(await decryptChat(chatKey, { ...sealed, ct: flipped }, ctx)).toBeNull();
    expect(await decryptChat(chatKey, { ct: "!!", iv: "??", epoch: 0 }, ctx)).toBeNull();
  });

  it("caps message length", async () => {
    const key = await deriveMeetingKey(roomKey(3), "chat");
    const sealed = await encryptChat(key, 0, "x".repeat(MEETING_CHAT_MAX_CHARS + 50), ctx);
    expect((await decryptChat(key, sealed, ctx))?.length).toBe(MEETING_CHAT_MAX_CHARS);
  });
});

describe("key ring", () => {
  it("keeps the current and previous epoch only", () => {
    let ring = emptyKeyRing<string>();
    ring = addKeyToRing(ring, { epoch: 1, key: "k1" });
    ring = addKeyToRing(ring, { epoch: 2, key: "k2" });
    expect(keyForEpochByte(ring, 2)).toBe("k2");
    expect(keyForEpochByte(ring, 1)).toBe("k1");
    const next = addKeyToRing(ring, { epoch: 3, key: "k3" });
    expect(keyForEpochByte(next, 1)).toBeUndefined();
    expect(keyForEpochByte(ring, 1)).toBe("k1");
  });

  it("ignores stale epochs and replaces the same epoch", () => {
    let ring = addKeyToRing(emptyKeyRing<string>(), { epoch: 5, key: "a" });
    ring = addKeyToRing(ring, { epoch: 4, key: "old" });
    expect(ring.current?.key).toBe("a");
    ring = addKeyToRing(ring, { epoch: 5, key: "b" });
    expect(ring.current?.key).toBe("b");
    expect(ring.previous).toBeNull();
  });

  it("matches epochs modulo 256", () => {
    const ring = addKeyToRing(emptyKeyRing<string>(), { epoch: 257, key: "k" });
    expect(keyForEpochByte(ring, 1)).toBe("k");
  });
});

describe("rekey send schedule", () => {
  it("keeps sending on the previous epoch for the grace period, then switches", () => {
    let s = scheduleSendKey(emptySendSchedule<string>(), { epoch: 0, key: "k0" }, 1000, 0);
    expect(s.send?.epoch).toBe(0);
    s = scheduleSendKey(s, { epoch: 1, key: "k1" }, 2000, REKEY_SEND_DELAY_MS);
    expect(settleSendKey(s, 2000 + REKEY_SEND_DELAY_MS - 1).send?.epoch).toBe(0);
    expect(settleSendKey(s, 2000 + REKEY_SEND_DELAY_MS).send?.epoch).toBe(1);
  });

  it("switches at once on join and for the same epoch", () => {
    const s = scheduleSendKey(emptySendSchedule<string>(), { epoch: 3, key: "k3" }, 0, REKEY_SEND_DELAY_MS);
    expect(s.send?.epoch).toBe(3);
    expect(scheduleSendKey(s, { epoch: 3, key: "k3b" }, 10, REKEY_SEND_DELAY_MS).send?.key).toBe("k3b");
  });

  it("two quick rekeys promote the first so the send key stays decryptable (in the ring)", () => {
    let ring = addKeyToRing(emptyKeyRing<string>(), { epoch: 0, key: "k0" });
    let s = scheduleSendKey(emptySendSchedule<string>(), { epoch: 0, key: "k0" }, 0, 0);
    ring = addKeyToRing(ring, { epoch: 1, key: "k1" });
    s = scheduleSendKey(s, { epoch: 1, key: "k1" }, 100, REKEY_SEND_DELAY_MS);
    ring = addKeyToRing(ring, { epoch: 2, key: "k2" });
    s = scheduleSendKey(s, { epoch: 2, key: "k2" }, 200, REKEY_SEND_DELAY_MS);
    expect(s.send?.epoch).toBe(1);
    expect(keyForEpochByte(ring, s.send!.epoch)).toBe("k1");
  });

  it("ignores an older epoch", () => {
    const s = scheduleSendKey(emptySendSchedule<string>(), { epoch: 5, key: "k5" }, 0, 0);
    expect(scheduleSendKey(s, { epoch: 4, key: "k4" }, 10, REKEY_SEND_DELAY_MS)).toEqual(s);
  });

  it("ignores an older epoch without a send grace too (a late catch-up key)", () => {
    const s = scheduleSendKey(emptySendSchedule<string>(), { epoch: 5, key: "k5" }, 0, 0);
    expect(scheduleSendKey(s, { epoch: 4, key: "k4" }, 10, 0)).toEqual(s);
  });
});
