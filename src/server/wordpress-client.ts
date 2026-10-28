import { driveBaseUrl } from "@/src/lib/nas-storage";
import type { WordpressCategory, WordpressStaffName } from "@/src/lib/wordpress-story";

/**
 * infocusnews.tv (WordPress on SNO), signed in as the Portal's user. The site's Cloudflare challenges every request
 * from Workers, so with Drive configured the calls go through Drive's relay and leave from the NAS.
 */
export type WordpressConfig = { baseUrl: string; authorization: string; relay: { baseUrl: string; token: string } | null };

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
  const driveToken = process.env.DRIVE_SERVICE_TOKEN?.trim();
  return {
    baseUrl,
    authorization: `Basic ${btoa(`${username}:${password}`)}`,
    relay: driveToken ? { baseUrl: driveBaseUrl(), token: driveToken } : null
  };
}

export class WordpressError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function wordpressRequest<T>(config: WordpressConfig, path: string, init: { method?: string; body?: BodyInit; headers?: Record<string, string> } = {}) {
  const { url, auth } = config.relay
    ? { url: `${config.relay.baseUrl}/api/service/wordpress/wp-json${path}`,
      auth: { Authorization: `Bearer ${config.relay.token}`, "X-Wordpress-Authorization": config.authorization } }
    : { url: `${config.baseUrl}/wp-json${path}`, auth: { Authorization: config.authorization } };
  const response = await fetch(url, {
    method: init.method ?? "GET",
    body: init.body,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { ...auth, "User-Agent": BROWSER_USER_AGENT, Accept: "application/json", ...init.headers }
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

/** Everyone with a byline on the site (SNO's Writer's Name boxes). */
export async function listWordpressStaffNames(config: WordpressConfig) {
  const staffNames: WordpressStaffName[] = [];
  for (let page = 1; ; page++) {
    const batch = await wordpressRequest<WordpressStaffName[]>(config, `/wp/v2/staff_name?per_page=100&page=${page}&_fields=id,name`);
    staffNames.push(...batch);
    if (batch.length < 100) return staffNames;
  }
}

/** A byline for someone the site doesn't have yet, as typing a new name in a Writer's Name box would add. */
export async function createWordpressStaffName(config: WordpressConfig, name: string) {
  const staff = await wordpressRequest<{ id: number }>(config, "/wp/v2/staff_name", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  return staff.id;
}

/** One request (title and alt text ride in the query), so a failure never leaves an upload whose ID was not returned. */
export async function uploadWordpressImage(config: WordpressConfig, image: { bytes: ArrayBuffer; filename: string; title: string }) {
  const query = new URLSearchParams({ title: image.title, alt_text: image.title });
  const media = await wordpressRequest<{ id: number }>(config, `/wp/v2/media?${query}`, {
    method: "POST",
    body: image.bytes,
    headers: { "Content-Type": "image/jpeg", "Content-Disposition": `attachment; filename="${image.filename}"` }
  });
  return media.id;
}

export type WordpressPost = { id: number; link: string; status: string; meta?: Record<string, unknown> };

/** A draft, so a story whose SNO fields did not save is never published. */
export async function createWordpressDraft(config: WordpressConfig, post: {
  title: string; categories: number[]; writers: number[]; featuredMedia: number; meta: Record<string, string>;
}) {
  return wordpressRequest<WordpressPost>(config, "/wp/v2/posts?context=edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: post.title, status: "draft", categories: post.categories, staff_name: post.writers, featured_media: post.featuredMedia,
      meta: post.meta
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

/**
 * A draft this user already made for this video, so a retry after a lost response does not post twice.
 * Only drafts: the post ID is saved before a story is scheduled, so a lost one is always still a draft.
 */
export async function findWordpressPostByVideo(config: WordpressConfig, videoId: string) {
  const me = await wordpressRequest<{ id: number }>(config, "/wp/v2/users/me?_fields=id");
  const posts = await wordpressRequest<WordpressPost[]>(config,
    `/wp/v2/posts?author=${me.id}&status=draft&context=edit&per_page=20&orderby=modified&order=desc&_fields=id,link,status,meta`);
  return posts.find((post) => typeof post.meta?.video === "string" && post.meta.video.includes(videoId)) ?? null;
}
