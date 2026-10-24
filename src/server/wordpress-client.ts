import type { WordpressCategory } from "@/src/lib/wordpress-story";

/** infocusnews.tv (WordPress on SNO), signed in as the Portal's user with an application password. */
export type WordpressConfig = { baseUrl: string; authorization: string };

// infocusnews.tv (LiteSpeed) refuses non-browser user agents.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const TIMEOUT_MS = 60_000;

/** Null until the site, user and application password are all set: packages are then not posted automatically. */
export function wordpressConfig(): WordpressConfig | null {
  const baseUrl = process.env.WORDPRESS_URL?.trim().replace(/\/+$/, "");
  const username = process.env.WORDPRESS_USERNAME?.trim();
  const password = process.env.WORDPRESS_APP_PASSWORD?.trim();
  if (!baseUrl || !username || !password || !/^https:\/\//.test(baseUrl)) return null;
  return { baseUrl, authorization: `Basic ${btoa(`${username}:${password}`)}` };
}

export class WordpressError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function wordpressRequest<T>(config: WordpressConfig, path: string, init: { method?: string; body?: BodyInit; headers?: Record<string, string> } = {}) {
  const response = await fetch(`${config.baseUrl}/wp-json${path}`, {
    method: init.method ?? "GET",
    body: init.body,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Authorization: config.authorization, "User-Agent": BROWSER_USER_AGENT, Accept: "application/json", ...init.headers }
  });
  if (!response.ok) {
    // WordPress errors are { code, message }; never echo the request (it carries the password).
    const detail = await response.json().then((body: { code?: unknown }) => typeof body?.code === "string" ? ` (${body.code})` : "", () => "");
    throw new WordpressError(`infocusnews.tv returned HTTP ${response.status}${detail}`, response.status);
  }
  return (await response.json()) as T;
}

export async function listWordpressCategories(config: WordpressConfig) {
  return wordpressRequest<WordpressCategory[]>(config, "/wp/v2/categories?per_page=100&_fields=id,name,slug,description");
}

export async function uploadWordpressImage(config: WordpressConfig, image: { bytes: ArrayBuffer; filename: string; title: string }) {
  const media = await wordpressRequest<{ id: number }>(config, "/wp/v2/media", {
    method: "POST",
    body: image.bytes,
    headers: { "Content-Type": "image/jpeg", "Content-Disposition": `attachment; filename="${image.filename}"` }
  });
  await wordpressRequest(config, `/wp/v2/media/${media.id}`, {
    method: "POST",
    body: JSON.stringify({ title: image.title, alt_text: image.title }),
    headers: { "Content-Type": "application/json" }
  });
  return media.id;
}

export type WordpressPost = { id: number; link: string; status: string; meta?: Record<string, unknown> };

/** A draft, so a story whose SNO fields did not save is never published. */
export async function createWordpressDraft(config: WordpressConfig, post: {
  title: string; categories: number[]; featuredMedia: number; meta: Record<string, string>;
}) {
  return wordpressRequest<WordpressPost>(config, "/wp/v2/posts?context=edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: post.title, status: "draft", categories: post.categories, featured_media: post.featuredMedia, meta: post.meta
    })
  });
}

export async function scheduleWordpressPost(config: WordpressConfig, postId: number, schedule: { status: "future" | "publish"; dateGmt: string }) {
  return wordpressRequest<WordpressPost>(config, `/wp/v2/posts/${postId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: schedule.status, date_gmt: schedule.dateGmt })
  });
}

/** A story this user already made for this video, so a retry after a lost response does not post twice. */
export async function findWordpressPostByVideo(config: WordpressConfig, videoId: string) {
  const me = await wordpressRequest<{ id: number }>(config, "/wp/v2/users/me?_fields=id");
  const posts = await wordpressRequest<WordpressPost[]>(config,
    `/wp/v2/posts?author=${me.id}&status=publish,future,draft,pending&context=edit&per_page=20&orderby=date&order=desc&_fields=id,link,status,meta`);
  return posts.find((post) => typeof post.meta?.video === "string" && post.meta.video.includes(`/embed/${videoId}`)) ?? null;
}
