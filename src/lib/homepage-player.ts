/**
 * Standalone homepage player for the public site (served at /api/public/live/embed).
 * Shows the latest show, or the live stream with a LIVE NOW nameplate while one is on.
 * The page only reads the public feeds (/api/public/live, /api/public/shows) from the browser.
 */

export const FALLBACK_PLAYLIST_ID = "PLM8kmk_OxoYk";
export const FRAME_ANCESTORS = ["https://infocusnews.tv", "https://www.infocusnews.tv"];
export const LIVE_POLL_MS = 60_000;
export const SHOWS_POLL_MS = 5 * 60_000;

export type PlayerVideo = { videoId: string; title: string };
export type PlayerTarget =
  | { kind: "playlist"; playlistId: string }
  | { kind: "show"; videoId: string; title: string }
  | { kind: "live"; videoId: string; title: string };

/**
 * Pure selection logic. Self-contained (no outer references) so the same source runs in the
 * browser via `toString()`. Results: a video, `null` (feed answered: nothing), `undefined` (unknown).
 */
function playerLogic() {
  const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
  const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/;

  function unwrap(payload: unknown): Record<string, unknown> | undefined {
    if (!payload || typeof payload !== "object") return undefined;
    const outer = payload as Record<string, unknown>;
    if (outer.ok === false) return undefined;
    const inner = "data" in outer ? outer.data : outer;
    return inner && typeof inner === "object" ? (inner as Record<string, unknown>) : undefined;
  }

  function cleanTitle(value: unknown, fallback: string): string {
    const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
    return (text || fallback).slice(0, 200);
  }

  function isVideoId(value: unknown): value is string {
    return typeof value === "string" && VIDEO_ID.test(value);
  }

  function isPlaylistId(value: unknown): value is string {
    return typeof value === "string" && PLAYLIST_ID.test(value);
  }

  /** Live now: first `live` entry with a valid id that has not ended. Upcoming/recent never count. */
  function pickLive(payload: unknown): PlayerVideo | null | undefined {
    const data = unwrap(payload);
    if (!data || !Array.isArray(data.live)) return undefined;
    for (const item of data.live as unknown[]) {
      if (!item || typeof item !== "object") continue;
      const video = item as Record<string, unknown>;
      if (!isVideoId(video.videoId) || video.endedAt) continue;
      return { videoId: video.videoId, title: cleanTitle(video.title, "InFocus Live") };
    }
    return null;
  }

  function pickLatest(payload: unknown): PlayerVideo | null | undefined {
    const data = unwrap(payload);
    if (!data || !("latest" in data)) return undefined;
    const latest = data.latest as Record<string, unknown> | null;
    if (!latest || typeof latest !== "object" || !isVideoId(latest.videoId)) return null;
    return { videoId: latest.videoId, title: cleanTitle(latest.title, "InFocus News") };
  }

  /**
   * What to play next. A failed live check (`undefined`) never ends a live stream or starts one;
   * a successful "nothing live" returns to the latest show (or the playlist if none is known).
   */
  function nextTarget(
    current: PlayerTarget,
    live: PlayerVideo | null | undefined,
    latest: PlayerVideo | null | undefined,
    fallbackPlaylistId: string
  ): PlayerTarget {
    if (live) return { kind: "live", videoId: live.videoId, title: live.title };
    if (live === undefined && current.kind === "live") return current;
    if (latest) return { kind: "show", videoId: latest.videoId, title: latest.title };
    if (current.kind === "show") return current;
    return { kind: "playlist", playlistId: fallbackPlaylistId };
  }

  /** Same key: keep the existing iframe (a live stream and a show with one id share a key). */
  function targetKey(target: PlayerTarget): string {
    return target.kind === "playlist" ? "p:" + target.playlistId : "v:" + target.videoId;
  }

  function embedUrl(target: PlayerTarget): string {
    if (target.kind === "playlist") {
      if (!isPlaylistId(target.playlistId)) return "about:blank";
      return "https://www.youtube.com/embed/videoseries?list=" + target.playlistId + "&rel=0&playsinline=1";
    }
    if (!isVideoId(target.videoId)) return "about:blank";
    return "https://www.youtube.com/embed/" + target.videoId + "?rel=0&playsinline=1" +
      (target.kind === "live" ? "&autoplay=1&mute=1" : "");
  }

  return { isVideoId, isPlaylistId, pickLive, pickLatest, nextTarget, targetKey, embedUrl };
}

export const homepagePlayer = playerLogic();

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Browser script: polls live every 60s and shows every 5 min while visible; swaps the iframe only on a new video. */
export function homepagePlayerScript(fallbackPlaylistId = FALLBACK_PLAYLIST_ID): string {
  return `(function () {
  var logic = (${playerLogic.toString()})();
  var FALLBACK = ${JSON.stringify(fallbackPlaylistId)};
  var frame = document.getElementById("player");
  var root = document.getElementById("root");
  var label = document.getElementById("label");
  var title = document.getElementById("title");
  var current = { kind: "playlist", playlistId: FALLBACK };
  var currentKey = logic.targetKey(current);
  var latest;
  var lastShows = 0;
  var lastLive = 0;

  function getJson(path) {
    return fetch(path + "?t=" + Date.now(), { cache: "no-store", credentials: "omit" })
      .then(function (res) { return res.ok ? res.json() : undefined; })
      .catch(function () { return undefined; });
  }

  function apply(target) {
    var key = logic.targetKey(target);
    if (key !== currentKey) {
      frame.src = logic.embedUrl(target);
      currentKey = key;
    }
    current = target;
    var isLive = target.kind === "live";
    root.className = isLive ? "live" : "";
    label.textContent = isLive ? "LIVE NOW" : "Watch the Latest Show";
    title.textContent = isLive ? target.title : "";
    title.hidden = !isLive;
    frame.title = isLive ? "InFocus livestream: " + target.title : "Latest InFocus News show";
  }

  function loadShows() {
    lastShows = Date.now();
    return getJson("/api/public/shows").then(function (json) {
      var picked = logic.pickLatest(json);
      if (picked !== undefined) latest = picked;
    });
  }

  function loadLive() {
    lastLive = Date.now();
    return getJson("/api/public/live").then(function (json) { return logic.pickLive(json); });
  }

  function refresh(withShows) {
    var shows = withShows ? loadShows() : Promise.resolve();
    return Promise.all([loadLive(), shows]).then(function (results) {
      apply(logic.nextTarget(current, results[0], latest, FALLBACK));
    });
  }

  function visible() { return document.visibilityState === "visible"; }

  function tick() {
    if (!visible()) return;
    var now = Date.now();
    if (now - lastLive >= ${LIVE_POLL_MS - 1000}) refresh(now - lastShows >= ${SHOWS_POLL_MS - 1000});
  }

  document.addEventListener("visibilitychange", function () {
    if (visible()) refresh(Date.now() - lastShows >= ${SHOWS_POLL_MS - 1000});
  });
  setInterval(tick, ${LIVE_POLL_MS});
  refresh(true);
})();`;
}

/** Full standalone HTML page. SNO-matched 54.4px heading strip + exact 16:9 video. */
export function renderHomepagePlayerHtml(nonce: string, fallbackPlaylistId = FALLBACK_PLAYLIST_ID): string {
  const playlist = homepagePlayer.isPlaylistId(fallbackPlaylistId) ? fallbackPlaylistId : FALLBACK_PLAYLIST_ID;
  const src = homepagePlayer.embedUrl({ kind: "playlist", playlistId: playlist });
  const safeNonce = escapeHtml(nonce);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="robots" content="noindex">
<title>InFocus News</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lexend:wght@500;600;700&display=swap">
<style nonce="${safeNonce}">
html, body { margin: 0; padding: 0; background: transparent; }
body { font-family: "Lexend", system-ui, -apple-system, "Segoe UI", sans-serif; }
#root { width: 100%; background: transparent; }
.nameplate { box-sizing: border-box; height: 54.4px; display: flex; align-items: center; gap: 12px; padding: 0 20px; background: #F4F6F5; color: #0F110F; border-bottom: 4px solid #0B6E3E; overflow: hidden; min-width: 0; }
#root.live .nameplate { border-bottom-color: #C21F3A; }
#root.live #label { color: #C21F3A; }
@media (prefers-color-scheme: dark) {
  .nameplate { background: #1A1D1A; color: #ECEFEA; }
  #root.live #label { color: #F48B9D; }
}
#label { flex: 0 1 auto; min-width: 0; font-size: 22px; font-weight: 600; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#root.live #label { flex: 0 0 auto; text-transform: uppercase; letter-spacing: 0.04em; }
#title { flex: 1 1 auto; min-width: 0; font-size: 16px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.92; }
#title[hidden] { display: none; }
.video { position: relative; width: 100%; padding-top: 56.25%; background: transparent; }
.video iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
@media (max-width: 420px) {
  .nameplate { padding: 0 14px; gap: 8px; }
  #label { font-size: 22px; }
  #title { font-size: 14px; }
}
</style>
</head>
<body>
<div id="root">
  <div class="nameplate"><span id="label">Watch the Latest Show</span><span id="title" hidden></span></div>
  <div class="video"><iframe id="player" src="${escapeHtml(src)}" title="Latest InFocus News show" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>
</div>
<script nonce="${safeNonce}">${homepagePlayerScript(playlist)}</script>
</body>
</html>`;
}

export function homepagePlayerCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}' https://fonts.googleapis.com`,
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${FRAME_ANCESTORS.join(" ")}`
  ].join("; ");
}
