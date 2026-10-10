import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/public/live/embed/route";
import {
  FALLBACK_PLAYLIST_ID,
  escapeHtml,
  homepagePlayer,
  homepagePlayerScript,
  renderHomepagePlayerHtml,
  type PlayerTarget
} from "@/src/lib/homepage-player";

const { pickLive, pickLatest, nextTarget, targetKey, embedUrl } = homepagePlayer;
const LIVE_ID = "aaaaaaaaaaa";
const SHOW_ID = "bbbbbbbbbbb";
const playlist: PlayerTarget = { kind: "playlist", playlistId: FALLBACK_PLAYLIST_ID };

describe("pickLive", () => {
  it("takes an active live video from the wrapped feed", () => {
    expect(pickLive({ data: { live: [{ videoId: LIVE_ID, title: " Game  night ", endedAt: null }], upcoming: [], recent: [] } }))
      .toEqual({ videoId: LIVE_ID, title: "Game night" });
  });

  it("ignores ended, invalid ids, upcoming and recent", () => {
    expect(
      pickLive({
        data: {
          live: [{ videoId: LIVE_ID, endedAt: "2026-10-09T01:00:00Z" }, { videoId: "bad<id>" }],
          upcoming: [{ id: "x", videoId: LIVE_ID, startsAt: "2026-10-09T02:00:00Z" }],
          recent: [{ videoId: SHOW_ID, endedAt: "2026-10-08T01:00:00Z" }]
        }
      })
    ).toBeNull();
  });

  it("is unknown for errors or malformed responses", () => {
    expect(pickLive({ error: { message: "down" } })).toBeUndefined();
    expect(pickLive({ ok: false, data: { live: [] } })).toBeUndefined();
    expect(pickLive(undefined)).toBeUndefined();
    expect(pickLive({ live: [] })).toBeNull();
  });
});

describe("pickLatest", () => {
  it("reads latest show", () => {
    expect(pickLatest({ data: { latest: { videoId: SHOW_ID, title: "Show" }, seasons: [] } })).toEqual({ videoId: SHOW_ID, title: "Show" });
    expect(pickLatest({ data: { latest: null } })).toBeNull();
    expect(pickLatest({ data: { latest: { videoId: "short" } } })).toBeNull();
    expect(pickLatest({ error: { message: "down" } })).toBeUndefined();
  });
});

describe("nextTarget", () => {
  const show = { videoId: SHOW_ID, title: "Show" };
  const live = { videoId: LIVE_ID, title: "Live" };
  const liveTarget: PlayerTarget = { kind: "live", ...live };

  it("goes live, and returns to the latest show when the feed says nothing is live", () => {
    expect(nextTarget(playlist, live, show, FALLBACK_PLAYLIST_ID)).toEqual(liveTarget);
    expect(nextTarget(liveTarget, null, show, FALLBACK_PLAYLIST_ID)).toEqual({ kind: "show", ...show });
    expect(nextTarget(liveTarget, null, null, FALLBACK_PLAYLIST_ID)).toEqual(playlist);
  });

  it("keeps a live stream when the live check fails", () => {
    expect(nextTarget(liveTarget, undefined, show, FALLBACK_PLAYLIST_ID)).toBe(liveTarget);
  });

  it("falls back to the playlist until a latest show is known", () => {
    expect(nextTarget(playlist, null, undefined, FALLBACK_PLAYLIST_ID)).toEqual(playlist);
    expect(nextTarget(playlist, undefined, show, FALLBACK_PLAYLIST_ID)).toEqual({ kind: "show", ...show });
  });

  it("keys live and show of the same video alike so the iframe is kept", () => {
    expect(targetKey({ kind: "live", videoId: SHOW_ID, title: "a" })).toBe(targetKey({ kind: "show", videoId: SHOW_ID, title: "b" }));
    expect(targetKey(playlist)).not.toBe(targetKey({ kind: "show", ...show }));
  });

  it("builds embed urls only from valid ids", () => {
    expect(embedUrl(playlist)).toBe(`https://www.youtube.com/embed/videoseries?list=${FALLBACK_PLAYLIST_ID}&rel=0&playsinline=1`);
    expect(embedUrl({ kind: "show", videoId: SHOW_ID, title: "" })).toBe(`https://www.youtube.com/embed/${SHOW_ID}?rel=0&playsinline=1`);
    expect(embedUrl({ kind: "show", videoId: "x\"><script>", title: "" })).toBe("about:blank");
  });
});

describe("rendering", () => {
  it("escapes text", () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  });

  it("renders the playlist fallback, nameplate and iframe attributes", () => {
    const html = renderHomepagePlayerHtml("abc123");
    expect(html).toContain("Watch the Latest Show");
    expect(html).toContain(`videoseries?list=${FALLBACK_PLAYLIST_ID}`);
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(html).toContain("allowfullscreen");
    expect(html).toContain("height: 60px");
    expect(html).toContain('<script nonce="abc123">');
  });

  it("ships a client script that parses and polls the public feeds", () => {
    const script = homepagePlayerScript();
    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain("/api/public/live");
    expect(script).toContain("/api/public/shows");
    expect(script).toContain("visibilitychange");
  });
});

describe("GET /api/public/live/embed", () => {
  it("serves no-store HTML framable only by the news site", async () => {
    const res = GET();
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-frame-options")).toBeNull();
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors https://infocusnews.tv https://www.infocusnews.tv");
    const nonce = /script-src 'nonce-([a-f0-9]+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(await res.text()).toContain(`<script nonce="${nonce}">`);
  });
});
