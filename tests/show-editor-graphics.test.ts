import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/prisma", () => ({ prisma: { showEditorDevice: {
  findFirst: async () => null,
  upsert: async () => ({ id: "legacy", revokedAt: null })
} } }));

import { POST } from "@/app/api/service/show-editor/graphics/route";
import { latestGraphicsSource } from "@/src/server/show-editor-graphics";

const SHA_OLD = "a".repeat(40);
const SHA_NEW = "b".repeat(40);
const ENV = { SHOW_EDITOR_GRAPHICS_TOKEN: "gh-token-for-tests" };
const RELEASE_URL = "https://api.github.com/repos/neelsatyavolu/infocus-graphics/releases/tags/graphics-source";

function asset(sha: string, updated: string, extra: Record<string, unknown> = {}) {
  return { name: `graphics-source-${sha}.tar.gz`, url: `https://api.github.com/assets/${sha}`, size: 1234,
    state: "uploaded", updated_at: updated, ...extra };
}

function github(assets: unknown[], { releaseStatus = 200, downloadStatus = 302 } = {}) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === RELEASE_URL) return new Response(JSON.stringify({ assets }), { status: releaseStatus });
    expect(init?.redirect).toBe("manual");
    return new Response(null, { status: downloadStatus,
      headers: downloadStatus === 302 ? { location: `https://signed.example/${String(url).split("/").pop()}` } : {} });
  });
}

describe("latestGraphicsSource", () => {
  it("returns the newest uploaded tarball as a signed link with its digest", async () => {
    const fetchImpl = github([
      asset(SHA_OLD, "2026-11-01T00:00:00Z"),
      asset(SHA_NEW, "2026-11-06T00:00:00Z", { digest: `sha256:${"c".repeat(64)}` }),
      { ...asset("d".repeat(40), "2026-11-07T00:00:00Z"), state: "starter" },
      { name: "notes.txt", url: "x", state: "uploaded", updated_at: "2026-11-08T00:00:00Z" }
    ]);
    const result = await latestGraphicsSource(fetchImpl as typeof fetch, ENV);
    expect(result).toEqual({ version: SHA_NEW, url: `https://signed.example/${SHA_NEW}`, size: 1234, sha256: "c".repeat(64) });
    const [, init] = fetchImpl.mock.calls[0];
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer gh-token-for-tests");
  });

  it("gives a reason, not an error, when nothing is set up yet", async () => {
    expect(await latestGraphicsSource(github([]) as typeof fetch, {})).toMatchObject({ version: null });
    expect(await latestGraphicsSource(github([], { releaseStatus: 404 }) as typeof fetch, ENV)).toMatchObject({ version: null });
    expect(await latestGraphicsSource(github([]) as typeof fetch, ENV)).toMatchObject({ version: null });
  });

  it("answers a refused token with a reason, so Macs don't retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await latestGraphicsSource(github([], { releaseStatus: 401 }) as typeof fetch, ENV))
      .toEqual({ version: null, reason: "GitHub refused the Portal's graphics token." });
  });

  it("leaves sha256 null when GitHub sends no digest", async () => {
    const result = await latestGraphicsSource(github([asset(SHA_NEW, "2026-11-06T00:00:00Z")]) as typeof fetch, ENV);
    expect(result).toMatchObject({ version: SHA_NEW, sha256: null });
  });

  it("treats a rate-limited 403 as a passing failure, not a refused token", async () => {
    const limited = vi.fn(async () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } }));
    await expect(latestGraphicsSource(limited as typeof fetch, ENV)).rejects.toThrow(/rate limit/);
  });

  it("throws when GitHub fails", async () => {
    await expect(latestGraphicsSource(github([], { releaseStatus: 500 }) as typeof fetch, ENV)).rejects.toThrow(/500/);
    await expect(latestGraphicsSource(github([asset(SHA_NEW, "x")], { downloadStatus: 200 }) as typeof fetch, ENV))
      .rejects.toThrow(/redirect/);
  });
});

describe("POST /api/service/show-editor/graphics", () => {
  it("needs an editor token", async () => {
    const res = await POST(new Request("https://portal.example.edu/api/service/show-editor/graphics", { method: "POST" }));
    expect(res.status).toBe(401);
  });
});
