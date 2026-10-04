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
