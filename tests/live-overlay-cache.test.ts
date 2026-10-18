import { describe, expect, it, vi } from "vitest";
import {
  OVERLAY_CACHE_SECONDS,
  isLiveOverlayRequest,
  serveCachedOverlay,
  type OverlayCache
} from "@/src/lib/live-overlay-cache";

const OVERLAY_URL = "https://portal.example.edu/api/live/overlay/abcDEF123456";

function memoryCache() {
  const store = new Map<string, Response>();
  const cache: OverlayCache = {
    match: vi.fn(async (key: Request) => store.get(key.url)?.clone()),
    put: vi.fn(async (key: Request, response: Response) => {
      store.set(key.url, response);
    })
  };
  return { cache, store };
}

function ctx() {
  const pending: Promise<unknown>[] = [];
  return { waitUntil: (p: Promise<unknown>) => pending.push(p), settle: () => Promise.all(pending) };
}

function overlayResponse(serverNow: number) {
  return new Response(JSON.stringify({ data: { scoreboard: { home: 3 }, serverNow } }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store, private" }
  });
}

describe("isLiveOverlayRequest", () => {
  it("matches GET /api/live/overlay/<key> only", () => {
    expect(isLiveOverlayRequest(new Request(OVERLAY_URL))).toBe(true);
    expect(isLiveOverlayRequest(new Request(OVERLAY_URL, { method: "POST" }))).toBe(false);
    expect(isLiveOverlayRequest(new Request("https://portal.example.edu/api/live/overlay"))).toBe(false);
    expect(isLiveOverlayRequest(new Request(`${OVERLAY_URL}/extra`))).toBe(false);
  });
});

describe("serveCachedOverlay", () => {
  it("stores a fresh overlay for a couple of seconds and keeps the browser from storing it", async () => {
    const { cache, store } = memoryCache();
    const c = ctx();

    const response = await serveCachedOverlay(new Request(OVERLAY_URL), async () => overlayResponse(1000), cache, c);
    await c.settle();

    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    expect((await response.json()).data.serverNow).toBe(1000);
    expect(store.get(OVERLAY_URL)?.headers.get("Cache-Control")).toBe(`public, max-age=${OVERLAY_CACHE_SECONDS}`);
  });

  it("answers from the cache with the current server time, without rendering", async () => {
    const { cache } = memoryCache();
    const c = ctx();
    await serveCachedOverlay(new Request(OVERLAY_URL), async () => overlayResponse(1000), cache, c);
    await c.settle();
    const render = vi.fn(async () => overlayResponse(9999));

    const response = await serveCachedOverlay(new Request(`${OVERLAY_URL}?t=1`), render, cache, c, () => 2500);
    const body = await response.json();

    expect(render).not.toHaveBeenCalled();
    expect(body.data).toEqual({ scoreboard: { home: 3 }, serverNow: 2500 });
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
  });

  it("does not store a missing overlay", async () => {
    const { cache, store } = memoryCache();
    const c = ctx();

    const response = await serveCachedOverlay(
      new Request(OVERLAY_URL),
      async () => new Response("{}", { status: 404 }),
      cache,
      c
    );
    await c.settle();

    expect(response.status).toBe(404);
    expect(store.size).toBe(0);
  });
});
