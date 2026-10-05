/**
 * One participant's frame keys, mirroring the browser exactly: the decrypt ring keeps the current
 * and previous epoch, and on a rekey the sender keeps the old epoch for REKEY_SEND_DELAY_MS
 * (src/lib/meetings/client/key-ring.ts; public/meet-e2ee-worker.js mirrors the same logic).
 */
import {
  addKeyToRing,
  emptyKeyRing,
  emptySendSchedule,
  keyForEpochByte,
  REKEY_SEND_DELAY_MS,
  scheduleSendKey,
  settleSendKey,
  type KeyRing,
  type KeyRingEntry,
  type SendSchedule
} from "../../src/lib/meetings/client/key-ring";

export type FrameKey = KeyRingEntry<CryptoKey>;

export class FrameKeys {
  private ring: KeyRing<CryptoKey> = emptyKeyRing();
  private schedule: SendSchedule<CryptoKey> = emptySendSchedule();

  constructor(first: FrameKey) {
    this.reset(first);
  }

  /** A fresh MeetingE2ee (join or rejoin): only the current key, used at once. */
  reset(entry: FrameKey) {
    this.ring = addKeyToRing(emptyKeyRing(), entry);
    this.schedule = scheduleSendKey(emptySendSchedule(), entry, Date.now(), 0);
  }

  /** MeetingE2ee.setKey: `rekey` delays the send switch by REKEY_SEND_DELAY_MS. */
  add(entry: FrameKey, rekey: boolean) {
    this.ring = addKeyToRing(this.ring, entry);
    this.schedule = scheduleSendKey(this.schedule, entry, Date.now(), rekey ? REKEY_SEND_DELAY_MS : 0);
  }

  /** The key to encrypt with now (settles a due switch first, per frame, like the worker). */
  sendKey(): FrameKey {
    this.schedule = settleSendKey(this.schedule, Date.now());
    if (!this.schedule.send) throw new Error("No send key.");
    return this.schedule.send;
  }

  forEpochByte(byte: number) {
    return keyForEpochByte(this.ring, byte);
  }
}
