/** Public InFocus app alerts: deciding what's new on each feed (pure, so it can be tested). */

export type NewsAudience = "shows" | "stories" | "live";

/**
 * One newest-item feed (shows by publish time, stories by WordPress post ID). `key` must grow
 * with newer items, so a deleted or hidden item never re-announces an older one. The first
 * time a feed is seen nothing is announced: only items after that point alert anyone.
 */
export function newestItemChange(lastKey: string | undefined, latestKey: string | null) {
  if (!latestKey) return { announce: false, nextKey: lastKey ?? null };
  if (lastKey === undefined) return { announce: false, nextKey: latestKey };
  return latestKey > lastKey ? { announce: true, nextKey: latestKey } : { announce: false, nextKey: lastKey };
}

/** Streams live now that weren't live at the last check (none on the very first check). */
export function newlyLive(lastIds: string | undefined, liveIds: string[]) {
  const seen = new Set((lastIds ?? "").split(",").filter(Boolean));
  return { announce: lastIds === undefined ? [] : liveIds.filter((id) => !seen.has(id)), nextIds: liveIds.join(",") };
}

/** WordPress post IDs as sortable keys. */
export function storyKey(postId: number) {
  return String(postId).padStart(12, "0");
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

/** WordPress titles arrive HTML-escaped ("Paly&#8217;s"). */
export function decodeHtmlEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === "#") {
      const code = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}
