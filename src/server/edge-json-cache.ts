// A small JSON value shared by every isolate of the Portal Worker, through Cloudflare's Cache API
// (caches.default). Module-level caches live in one isolate, and the Worker runs many, so they
// rarely hit. The Worker is pinned to one region (wrangler.jsonc placement), so in practice every
// request reaches the same cache. Off Workers (local dev, tests) there is no cache and reads miss.
import { mainAppOrigin } from "@/src/lib/hosts";
import { isWorkersRuntime } from "@/src/lib/prisma-workers";

/** The subset of Cloudflare's Cache API used here. */
export type EdgeCache = {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
};

function workersCache(): EdgeCache | null {
  if (!isWorkersRuntime()) return null;
  return (caches as unknown as { default: EdgeCache }).default;
}

/** A path no route serves; the Cache API only needs a URL on the Portal's own domain. */
function cacheKey(name: string): Request {
  return new Request(new URL(`/__edge-cache/${encodeURIComponent(name)}`, mainAppOrigin()).toString());
}

/** The stored value, or null on a miss or any cache error (callers then load it themselves). */
export async function readEdgeJson<T>(name: string, cache: EdgeCache | null = workersCache()): Promise<T | null> {
  if (!cache) return null;
  try {
    const hit = await cache.match(cacheKey(name));
    return hit ? ((await hit.json()) as T) : null;
  } catch (error) {
    console.error("edge cache read failed", name, error);
    return null;
  }
}

/** Stores the value for up to `maxAgeSeconds`. Best effort: a failed write only costs a later miss. */
export async function writeEdgeJson(
  name: string,
  value: unknown,
  maxAgeSeconds: number,
  cache: EdgeCache | null = workersCache()
): Promise<void> {
  if (!cache) return;
  try {
    const response = new Response(JSON.stringify(value), {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxAgeSeconds}` }
    });
    await cache.put(cacheKey(name), response);
  } catch (error) {
    console.error("edge cache write failed", name, error);
  }
}
