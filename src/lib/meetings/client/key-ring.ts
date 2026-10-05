import { epochByte } from "./frame-crypto";

/** Current meeting key plus the previous epoch's key, so frames in flight during a rekey still decrypt. */
export type KeyRingEntry<K> = { epoch: number; key: K };
export type KeyRing<K> = { current: KeyRingEntry<K> | null; previous: KeyRingEntry<K> | null };

export function emptyKeyRing<K>(): KeyRing<K> {
  return { current: null, previous: null };
}

/** Returns a new ring with `entry` applied. Older epochs than the current one are ignored. */
export function addKeyToRing<K>(ring: KeyRing<K>, entry: KeyRingEntry<K>): KeyRing<K> {
  const { current } = ring;
  if (!current) return { current: entry, previous: null };
  if (entry.epoch === current.epoch) return { current: entry, previous: ring.previous };
  if (entry.epoch > current.epoch) return { current: entry, previous: current };
  return ring;
}

export function keyForEpochByte<K>(ring: KeyRing<K>, byte: number): K | undefined {
  if (ring.current && epochByte(ring.current.epoch) === byte) return ring.current.key;
  if (ring.previous && epochByte(ring.previous.epoch) === byte) return ring.previous.key;
  return undefined;
}

/**
 * Which key to ENCRYPT with. On a rekey every participant fetches the new key from the Portal at
 * its own pace, so senders keep using the previous epoch for a short grace period while
 * receivers already decrypt both (the ring keeps current + previous). Without it, everyone who
 * hasn't fetched yet drops the new frames, and Opus loss concealment turns that into robotic audio.
 * `public/meet-e2ee-worker.js` mirrors this exactly.
 */
export const REKEY_SEND_DELAY_MS = 2000;

export type SendSchedule<K> = {
  send: KeyRingEntry<K> | null;
  pending: KeyRingEntry<K> | null;
  switchAt: number | null;
};

export function emptySendSchedule<K>(): SendSchedule<K> {
  return { send: null, pending: null, switchAt: null };
}

/** A new key: send with it at once (first key, same epoch, no delay), else after `delayMs`. */
export function scheduleSendKey<K>(schedule: SendSchedule<K>, entry: KeyRingEntry<K>, now: number, delayMs: number): SendSchedule<K> {
  const settled = settleSendKey(schedule, now);
  const { send } = settled;
  if (!send || delayMs <= 0 || entry.epoch === send.epoch) return { send: entry, pending: null, switchAt: null };
  if (entry.epoch < send.epoch) return settled;
  // A pending key is promoted before queueing the next, so the send key is always in the ring.
  return { send: settled.pending ?? send, pending: entry, switchAt: now + delayMs };
}

/** Applies a due switch (checked lazily per frame; no timers). */
export function settleSendKey<K>(schedule: SendSchedule<K>, now: number): SendSchedule<K> {
  if (schedule.pending && schedule.switchAt !== null && now >= schedule.switchAt) {
    return { send: schedule.pending, pending: null, switchAt: null };
  }
  return schedule;
}
