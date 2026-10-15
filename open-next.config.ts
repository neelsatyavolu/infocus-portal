import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";

// Cloudflare Workers build (wrangler.jsonc). R2 holds the Next data cache (unstable_cache in
// src/server/public-feed.ts, fetch revalidate); the queue drives time-based revalidation.
// No tag cache: nothing calls revalidateTag or revalidatePath. The regional cache (Cache API, per
// colo) sits in front of R2 so a cache hit doesn't pay an R2 read.
export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: "long-lived" }),
  queue: doQueue
});
