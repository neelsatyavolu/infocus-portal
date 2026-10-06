/** Pure sliding-window rate limiter: per key, the timestamps of recent allowed actions. */

export type RateBuckets = Readonly<Record<string, readonly number[]>>;

export type RateRule = { limit: number; windowMs: number };

export const RATE_RULES = {
  reaction: { limit: 20, windowMs: 10_000 },
  chat: { limit: 10, windowMs: 10_000 },
  /** Watch-together play/pause/seek per uid (the scrubber is debounced on the client). */
  watch: { limit: 20, windowMs: 10_000 },
  /** Partytracks proxy calls per uid. */
  proxy: { limit: 60, windowMs: 10_000 },
  /** Every non-ping message per socket (hand, media, tracks, host commands, …). */
  message: { limit: 30, windowMs: 5_000 }
} as const satisfies Record<string, RateRule>;

export type RateKind = keyof typeof RATE_RULES;

export function rateKey(uid: string, kind: RateKind): string {
  return `${uid}:${kind}`;
}

export function takeToken(
  buckets: RateBuckets,
  key: string,
  rule: RateRule,
  now: number
): { allowed: boolean; buckets: RateBuckets } {
  const recent = (buckets[key] ?? []).filter((at) => now - at < rule.windowMs);
  if (recent.length >= rule.limit) return { allowed: false, buckets: { ...buckets, [key]: recent } };
  return { allowed: true, buckets: { ...buckets, [key]: [...recent, now] } };
}

export function socketRateKey(socketId: string): string {
  return `socket:${socketId}:message`;
}

/** Drops one key (a closed socket's bucket). */
export function forgetKey(buckets: RateBuckets, key: string): RateBuckets {
  if (!(key in buckets)) return buckets;
  const { [key]: _dropped, ...rest } = buckets;
  return rest;
}

/** Drops every key of a uid (on leave) so buckets do not grow without bound. */
export function forgetUid(buckets: RateBuckets, uid: string): RateBuckets {
  const prefix = `${uid}:`;
  return Object.fromEntries(Object.entries(buckets).filter(([key]) => !key.startsWith(prefix)));
}
