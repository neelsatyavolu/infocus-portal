import { describe, expect, it } from "vitest";
import { forgetKey, forgetUid, RATE_RULES, rateKey, socketRateKey, takeToken, type RateBuckets } from "../src/rate-limit";

function takeMany(count: number, kind: "chat" | "reaction", now: number, start: RateBuckets = {}) {
  let buckets = start;
  const results: boolean[] = [];
  for (let i = 0; i < count; i += 1) {
    const taken = takeToken(buckets, rateKey("u1", kind), RATE_RULES[kind], now);
    buckets = taken.buckets;
    results.push(taken.allowed);
  }
  return { buckets, results };
}

describe("rate limits", () => {
  it("allows 10 chats per 10 s and drops the 11th", () => {
    const { results } = takeMany(11, "chat", 0);
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(results[10]).toBe(false);
  });

  it("allows 20 reactions per 10 s", () => {
    const { results } = takeMany(21, "reaction", 0);
    expect(results.filter(Boolean)).toHaveLength(20);
  });

  it("frees capacity once the window passes", () => {
    const { buckets } = takeMany(10, "chat", 0);
    expect(takeToken(buckets, rateKey("u1", "chat"), RATE_RULES.chat, 9_999).allowed).toBe(false);
    expect(takeToken(buckets, rateKey("u1", "chat"), RATE_RULES.chat, 10_000).allowed).toBe(true);
  });

  it("limits each uid separately and forgets a uid", () => {
    const { buckets } = takeMany(10, "chat", 0);
    expect(takeToken(buckets, rateKey("u2", "chat"), RATE_RULES.chat, 1).allowed).toBe(true);
    expect(forgetUid(buckets, "u1")).toEqual({});
  });
});

describe("proxy and per-socket message limits", () => {
  it("allows 60 proxy calls per 10 s per uid", () => {
    let buckets: RateBuckets = {};
    const allowed = Array.from({ length: 61 }, () => {
      const taken = takeToken(buckets, rateKey("u1", "proxy"), RATE_RULES.proxy, 0);
      buckets = taken.buckets;
      return taken.allowed;
    });
    expect(allowed.filter(Boolean)).toHaveLength(60);
  });

  it("allows 30 messages per 5 s per socket and forgets a closed socket", () => {
    let buckets: RateBuckets = {};
    const key = socketRateKey("sock-1");
    const allowed = Array.from({ length: 31 }, () => {
      const taken = takeToken(buckets, key, RATE_RULES.message, 0);
      buckets = taken.buckets;
      return taken.allowed;
    });
    expect(allowed.filter(Boolean)).toHaveLength(30);
    expect(takeToken(buckets, socketRateKey("sock-2"), RATE_RULES.message, 0).allowed).toBe(true);
    expect(forgetKey(buckets, key)).toEqual({});
  });
});
