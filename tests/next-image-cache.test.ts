import { describe, expect, it, vi } from "vitest";
import { IMAGE_CACHE_CONTROL, isNextImageRequest, serveCachedImage, type ImageCache } from "@/src/lib/next-image-cache";

const IMAGE_URL = "https://portal.example.edu/_next/image?url=%2Ffavicon%2Flogo.png&w=640&q=75";

function memoryCache() {
  const store = new Map<string, Response>();
  const cache: ImageCache = {
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

describe("isNextImageRequest", () => {
  it("matches GET /_next/image only", () => {
    expect(isNextImageRequest(new Request(IMAGE_URL))).toBe(true);
    expect(isNextImageRequest(new Request(IMAGE_URL, { method: "POST" }))).toBe(false);
    expect(isNextImageRequest(new Request("https://portal.example.edu/_next/static/a.js"))).toBe(false);
  });
});

describe("serveCachedImage", () => {
  it("adds a cache header when the image handler sends none, and stores the image", async () => {
    const { cache, store } = memoryCache();
    const c = ctx();
    const render = vi.fn(async () => new Response("img", { headers: { "Content-Type": "image/webp" } }));

    const response = await serveCachedImage(new Request(IMAGE_URL, { headers: { Accept: "image/webp" } }), render, cache, c);
    await c.settle();

    expect(response.headers.get("Cache-Control")).toBe(IMAGE_CACHE_CONTROL);
    expect(await response.text()).toBe("img");
    expect(store.size).toBe(1);
  });

  it("serves a stored image without resizing it again", async () => {
    const { cache } = memoryCache();
    const c = ctx();
    const render = vi.fn(async () => new Response("img", { headers: { "Content-Type": "image/webp" } }));
    const request = () => new Request(IMAGE_URL, { headers: { Accept: "image/webp" } });

    await serveCachedImage(request(), render, cache, c);
    await c.settle();
    const second = await serveCachedImage(request(), render, cache, c);

    expect(render).toHaveBeenCalledTimes(1);
    expect(await second.text()).toBe("img");
  });

  it("keeps separate copies per image format the browser accepts", async () => {
    const { cache, store } = memoryCache();
    const c = ctx();
    const render = vi.fn(async () => new Response("img"));

    await serveCachedImage(new Request(IMAGE_URL, { headers: { Accept: "image/avif,image/webp" } }), render, cache, c);
    await serveCachedImage(new Request(IMAGE_URL, { headers: { Accept: "image/webp" } }), render, cache, c);
    await serveCachedImage(new Request(IMAGE_URL, { headers: { Accept: "image/png" } }), render, cache, c);
    await c.settle();

    expect(render).toHaveBeenCalledTimes(3);
    expect(store.size).toBe(3);
  });

  it("keeps the handler's own cache header", async () => {
    const { cache } = memoryCache();
    const c = ctx();
    const immutable = "public, max-age=315360000, immutable";
    const render = async () => new Response("img", { headers: { "Cache-Control": immutable } });

    const response = await serveCachedImage(new Request(IMAGE_URL), render, cache, c);

    expect(response.headers.get("Cache-Control")).toBe(immutable);
  });

  it("does not store errors", async () => {
    const { cache, store } = memoryCache();
    const c = ctx();
    const render = async () => new Response("bad url", { status: 400 });

    const response = await serveCachedImage(new Request(IMAGE_URL), render, cache, c);
    await c.settle();

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBeNull();
    expect(store.size).toBe(0);
  });
});
