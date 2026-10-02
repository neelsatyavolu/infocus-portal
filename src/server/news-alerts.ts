import { apnsTopic, isApnsConfigured, sendApns, type ApnsAlert } from "@/src/lib/apns";
import {
  decodeHtmlEntities,
  newestItemChange,
  newlyLive,
  storyKey,
  type NewsAudience
} from "@/src/lib/news-alerts";
import { prisma } from "@/src/lib/prisma";
import { loadPublicLive, loadPublicSeasons } from "@/src/server/public-feed";

/**
 * Alerts for the public InFocus app: a new public show, a new infocusnews.tv story, or a
 * stream going live, each sent once to the iPhones that asked for that kind.
 */

const STORIES_URL = "https://infocusnews.tv/wp-json/wp/v2/posts?per_page=1&_fields=id,title,link";
// infocusnews.tv (LiteSpeed) refuses non-browser user agents.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const SEND_BATCH = 500;

type FeedName = "show" | "story" | "live";

async function latestStory() {
  const response = await fetch(STORIES_URL, {
    headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`infocusnews.tv returned HTTP ${response.status}`);
  const [post] = (await response.json()) as { id?: number; title?: { rendered?: string }; link?: string }[];
  if (!post || typeof post.id !== "number") return null;
  return { id: post.id, title: decodeHtmlEntities(post.title?.rendered ?? "").trim() || "New story", link: post.link };
}

/** Sends to every iPhone that wants this kind of alert; forgets tokens Apple says are gone. */
async function sendToAudience(audience: NewsAudience, alert: ApnsAlert, topic: string) {
  const rows = await prisma.newsPushDevice.findMany({ where: { [audience]: true }, select: { token: true, environment: true } });
  let sent = 0;
  for (let start = 0; start < rows.length; start += SEND_BATCH) {
    const devices = rows.slice(start, start + SEND_BATCH).flatMap((row) =>
      row.environment === "production" || row.environment === "development"
        ? [{ token: row.token, environment: row.environment, topic } as const]
        : []
    );
    const results = await sendApns(devices, alert);
    sent += results.filter((result) => result.ok).length;
    const dead = results.filter((result) => result.dead).map((result) => result.token);
    if (dead.length > 0) await prisma.newsPushDevice.deleteMany({ where: { token: { in: dead } } });
  }
  return sent;
}

async function saveState(feed: FeedName, lastId: string | null) {
  if (lastId === null) return;
  await prisma.newsFeedState.upsert({ where: { feed }, update: { lastId }, create: { feed, lastId } });
}

/** One check of every feed. Never throws: one broken feed doesn't stop the others. */
export async function runNewsAlerts() {
  const topic = apnsTopic("news");
  if (!topic || !isApnsConfigured()) return { skipped: true, sent: { shows: 0, stories: 0, live: 0 } };
  const state = new Map((await prisma.newsFeedState.findMany()).map((row) => [row.feed, row.lastId]));
  const sent = { shows: 0, stories: 0, live: 0 };

  const checks: Record<FeedName, () => Promise<void>> = {
    show: async () => {
      const latest = (await loadPublicSeasons()).find((season) => season.shows.length > 0)?.shows[0];
      const change = newestItemChange(state.get("show"), latest?.publishedAt ?? null);
      if (change.announce && latest) {
        sent.shows = await sendToAudience("shows", {
          title: "New InFocus show",
          body: latest.title,
          threadId: "shows",
          url: `https://www.youtube.com/watch?v=${latest.videoId}`,
          data: { kind: "show", videoId: latest.videoId }
        }, topic);
      }
      await saveState("show", change.nextKey);
    },
    story: async () => {
      const story = await latestStory();
      const change = newestItemChange(state.get("story"), story ? storyKey(story.id) : null);
      if (change.announce && story) {
        sent.stories = await sendToAudience("stories", {
          title: "New on InFocus",
          body: story.title,
          threadId: "stories",
          url: story.link,
          data: { kind: "story", postId: String(story.id) }
        }, topic);
      }
      await saveState("story", change.nextKey);
    },
    live: async () => {
      const { live } = await loadPublicLive();
      const change = newlyLive(state.get("live"), live.map((video) => video.videoId));
      for (const video of live.filter((stream) => change.announce.includes(stream.videoId))) {
        sent.live += await sendToAudience("live", {
          title: "InFocus is live",
          body: video.title,
          threadId: "live",
          url: `https://www.youtube.com/watch?v=${video.videoId}`,
          data: { kind: "live", videoId: video.videoId }
        }, topic);
      }
      await saveState("live", change.nextIds);
    }
  };

  for (const [feed, check] of Object.entries(checks)) {
    try {
      await check();
    } catch (error) {
      console.error(`News alerts: ${feed} check failed`, error instanceof Error ? error.message : error);
    }
  }
  return { skipped: false, sent };
}
