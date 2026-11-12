import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ $queryRaw: vi.fn(), $executeRaw: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));

import { getClientIp, getRequestKey } from "@/src/lib/rate-limit";
import { checkSharedRateLimit } from "@/src/server/shared-rate-limit";

function request(headers: Record<string, string>) {
  return new Request("https://infocus.test/api/x", { headers });
}

describe("getClientIp", () => {
  it("prefers cf-connecting-ip over anything the client sends", () => {
    expect(
      getClientIp(request({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 203.0.113.9" }))
    ).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then the last x-forwarded-for entry, then unknown", () => {
    expect(getClientIp(request({ "x-real-ip": "198.51.100.4", "x-forwarded-for": "1.1.1.1" }))).toBe("198.51.100.4");
    expect(getClientIp(request({ "x-forwarded-for": "1.1.1.1, 198.51.100.7 " }))).toBe("198.51.100.7");
    expect(getClientIp(request({}))).toBe("unknown");
  });

  it("builds scoped keys", () => {
    expect(getRequestKey(request({ "cf-connecting-ip": "203.0.113.9" }), "guest-links:create")).toBe(
      "guest-links:create:203.0.113.9"
    );
  });
});

describe("checkSharedRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => vi.restoreAllMocks());

  it("allows calls up to max in one atomic upsert", async () => {
    db.$queryRaw.mockResolvedValueOnce([{ count: 3 }]);
    await expect(checkSharedRateLimit("k", { max: 3, windowMs: 60_000 })).resolves.toEqual({
      allowed: true,
      remaining: 0
    });
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = (db.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(sql).toMatch(/INSERT INTO "RateLimitBucket"[\s\S]*ON CONFLICT \("key"\) DO UPDATE[\s\S]*RETURNING/);
    expect(db.$queryRaw.mock.calls[0].slice(1)).toEqual(["k", 60_000]);
  });

  it("blocks once the count passes max", async () => {
    db.$queryRaw.mockResolvedValueOnce([{ count: 4 }]);
    await expect(checkSharedRateLimit("k", { max: 3, windowMs: 60_000 })).resolves.toEqual({
      allowed: false,
      remaining: 0
    });
  });

  it("occasionally deletes expired buckets", async () => {
    db.$queryRaw.mockResolvedValue([{ count: 1 }]);
    await checkSharedRateLimit("k", { max: 3, windowMs: 60_000 });
    expect(db.$executeRaw).not.toHaveBeenCalled();

    vi.spyOn(Math, "random").mockReturnValue(0.001);
    await checkSharedRateLimit("k", { max: 3, windowMs: 60_000 });
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("falls back to the per-isolate limit when the database fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.$queryRaw.mockRejectedValue(new Error("db down"));
    const config = { max: 1, windowMs: 60_000 };
    expect((await checkSharedRateLimit("fallback-key", config)).allowed).toBe(true);
    expect((await checkSharedRateLimit("fallback-key", config)).allowed).toBe(false);
    expect(log).toHaveBeenCalled();
  });
});
