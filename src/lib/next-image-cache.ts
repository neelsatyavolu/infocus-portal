// Caches resized images (/_next/image) on Cloudflare (worker.ts). OpenNext's image handler sends no
// Cache-Control unless the source is immutable, so without this every page view re-ran the Worker
// and the Images binding for the logo, avatars and thumbnails, and the browser kept nothing.

/** One day fresh, then served stale for up to a week while the next request refreshes it. */
export const IMAGE_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

/** The subset of Cloudflare's Cache API used here (caches.default in the Worker). */
export type ImageCache = {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
};

type WaitUntil = { waitUntil(promise: Promise<unknown>): void };

export function isNextImageRequest(request: Request): boolean {
  return request.method === "GET" && new URL(request.url).pathname === "/_next/image";
}

/** The handler picks the output format from Accept, so the cache keeps one copy per format. */
function cacheKey(request: Request): Request {
  const accept = request.headers.get("Accept") ?? "";
  const format = accept.includes("image/avif") ? "avif" : accept.includes("image/webp") ? "webp" : "original";
  const url = new URL(request.url);
  url.searchParams.set("__format", format);
  return new Request(url.toString());
}

function withCacheControl(response: Response): Response {
  if (response.headers.has("Cache-Control")) return response;
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", IMAGE_CACHE_CONTROL);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function serveCachedImage(
  request: Request,
  render: () => Promise<Response>,
  cache: ImageCache,
  ctx: WaitUntil
): Promise<Response> {
  const key = cacheKey(request);
  const cached = await cache.match(key).catch(() => undefined);
  if (cached) return cached;

  const rendered = await render();
  if (rendered.status !== 200) return rendered;

  const response = withCacheControl(rendered);
  ctx.waitUntil(cache.put(key, response.clone()).catch((error) => console.error("image cache put failed", error)));
  return response;
}
