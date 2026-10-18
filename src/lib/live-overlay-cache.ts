// Caches the OBS overlay feed (/api/live/overlay/<key>) on Cloudflare for a couple of seconds
// (worker.ts). OBS polls it every second, and without this each poll loaded Next.js and queried the
// database. A cache hit skips both. serverNow is restamped on every hit, because the overlay's clock
// sync (useServerOffset in components/live/live-stage.tsx) trusts its fastest response, and a hit is
// always the fastest.

/** How long a stored overlay is served: scoreboard changes reach the stream up to this much later. */
export const OVERLAY_CACHE_SECONDS = 2;

const OVERLAY_PATH = /^\/api\/live\/overlay\/[^/]+$/;
const NO_STORE = "no-store, private";

/** The subset of Cloudflare's Cache API used here (caches.default in the Worker). */
export type OverlayCache = {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
};

type WaitUntil = { waitUntil(promise: Promise<unknown>): void };

export function isLiveOverlayRequest(request: Request): boolean {
  return request.method === "GET" && OVERLAY_PATH.test(new URL(request.url).pathname);
}

/** The overlay ignores query strings, so a cache-busting one must not split the cache. */
function cacheKey(request: Request): Request {
  const url = new URL(request.url);
  url.search = "";
  return new Request(url.toString());
}

function json(body: string, cacheControl: string): Response {
  return new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": cacheControl } });
}

/** A stored body with serverNow set to now, or null when it isn't an overlay payload. */
function restamped(body: string, now: number): string | null {
  try {
    const parsed = JSON.parse(body) as { data?: Record<string, unknown> };
    if (!parsed.data || typeof parsed.data !== "object") return null;
    return JSON.stringify({ ...parsed, data: { ...parsed.data, serverNow: now } });
  } catch {
    return null;
  }
}

export async function serveCachedOverlay(
  request: Request,
  render: () => Promise<Response>,
  cache: OverlayCache,
  ctx: WaitUntil,
  now: () => number = Date.now
): Promise<Response> {
  const key = cacheKey(request);
  const cached = await cache.match(key).catch(() => undefined);
  if (cached) {
    const body = restamped(await cached.text(), now());
    if (body !== null) return json(body, NO_STORE);
  }

  const rendered = await render();
  if (rendered.status !== 200) return rendered;

  const body = await rendered.text();
  const stored = json(body, `public, max-age=${OVERLAY_CACHE_SECONDS}`);
  ctx.waitUntil(cache.put(key, stored).catch((error) => console.error("overlay cache put failed", error)));
  return json(body, NO_STORE);
}
