import { unstable_cache } from "next/cache";
import { pacificDateKey } from "@/src/lib/deadlines";
import { prisma } from "@/src/lib/prisma";
import {
  classifyStreams,
  isPublicShowVideo,
  mergeUpcoming,
  publicAnnouncements,
  seasonPlaylists,
  sortShowsNewestFirst,
  toPublicShow,
  uploadsPlaylistId,
  type PublicSeason,
  type PublicShow,
  type YoutubeVideo
} from "@/src/lib/public-feed";
import { addDaysToDateKey, listUpcomingShowDates } from "@/src/lib/show-assignment";
import { bulletinParagraphs } from "@/src/server/show-story";
import { loadScheduleOverrides } from "@/src/server/show-schedule";
import { listYoutubePlaylists, youtubeAccessToken, youtubeGet } from "@/src/server/youtube-client";

/**
 * Shows, livestreams and show announcements for the public InFocus iPhone app, read
 * with the Portal's channel authorization. Cached in tiers to spare the YouTube quota:
 * past seasons rarely change, the current season and live streams do.
 */

const PLAYLISTS_TTL_S = 60 * 60;
const CURRENT_SEASON_TTL_S = 10 * 60;
const ARCHIVED_SEASON_TTL_S = 24 * 60 * 60;
const LIVE_TTL_S = 2 * 60;
const ACCESS_TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_PLAYLIST_PAGES = 6;
const UPCOMING_SHOW_DATES = 20;
const UPCOMING_EVENT_GRACE_MS = 3 * 60 * 60 * 1000;

export class PublicFeedError extends Error {}

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

async function accessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) return cachedAccessToken.value;
  const value = await youtubeAccessToken();
  cachedAccessToken = { value, expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS };
  return value;
}

function stringsAt(items: unknown, read: (item: Record<string, unknown>) => unknown) {
  return Array.isArray(items) ? items.flatMap((item) => {
    const value = read(item as Record<string, unknown>);
    return typeof value === "string" ? [value] : [];
  }) : [];
}

async function playlistVideoIds(playlistId: string, maxPages: number) {
  const token = await accessToken();
  const ids: string[] = [];
  let pageToken = "";
  for (let page = 0; page < maxPages; page++) {
    const query = `playlistItems?part=contentDetails&maxResults=50&playlistId=${encodeURIComponent(playlistId)}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const data = await youtubeGet(query, token);
    ids.push(...stringsAt(data.items, (item) => (item.contentDetails as { videoId?: unknown } | undefined)?.videoId));
    if (typeof data.nextPageToken !== "string") break;
    pageToken = data.nextPageToken;
  }
  return ids;
}

async function videoDetails(ids: string[]): Promise<YoutubeVideo[]> {
  const token = await accessToken();
  const videos: YoutubeVideo[] = [];
  for (let start = 0; start < ids.length; start += 50) {
    const chunk = ids.slice(start, start + 50).join(",");
    const data = await youtubeGet(`videos?part=snippet,contentDetails,status,liveStreamingDetails&id=${chunk}`, token);
    if (Array.isArray(data.items)) videos.push(...(data.items as YoutubeVideo[]));
  }
  return videos;
}

async function fetchSeasonShows(playlistId: string): Promise<PublicShow[]> {
  const videos = await videoDetails(await playlistVideoIds(playlistId, MAX_PLAYLIST_PAGES));
  return sortShowsNewestFirst(videos.filter(isPublicShowVideo).map(toPublicShow));
}

const cachedSeasonPlaylists = unstable_cache(
  async () => seasonPlaylists(await listYoutubePlaylists(await accessToken())),
  ["public-feed-season-playlists"],
  { revalidate: PLAYLISTS_TTL_S }
);
const cachedCurrentSeason = unstable_cache(fetchSeasonShows, ["public-feed-current-season"], {
  revalidate: CURRENT_SEASON_TTL_S
});
const cachedArchivedSeason = unstable_cache(fetchSeasonShows, ["public-feed-archived-season"], {
  revalidate: ARCHIVED_SEASON_TTL_S
});
const cachedRecentUploads = unstable_cache(
  async () => {
    const uploads = uploadsPlaylistId(process.env.YOUTUBE_CHANNEL_ID?.trim() ?? "");
    if (!uploads) throw new PublicFeedError("YouTube channel is not configured.");
    return videoDetails(await playlistVideoIds(uploads, 1));
  },
  ["public-feed-recent-uploads"],
  { revalidate: LIVE_TTL_S }
);

async function upcomingShowDates(now: Date) {
  const today = pacificDateKey(now);
  const overrides = await loadScheduleOverrides(today, addDaysToDateKey(today, 150));
  return listUpcomingShowDates(today, UPCOMING_SHOW_DATES, overrides);
}

export async function loadPublicSeasons(): Promise<PublicSeason[]> {
  const playlists = await cachedSeasonPlaylists();
  return Promise.all(
    playlists.map(async (playlist, index) => ({
      ...playlist,
      shows: await (index === 0 ? cachedCurrentSeason : cachedArchivedSeason)(playlist.playlistId)
    }))
  );
}

export async function loadPublicShows(now = new Date()) {
  const [seasons, dates] = await Promise.all([loadPublicSeasons(), upcomingShowDates(now)]);
  const latest = seasons.find((season) => season.shows.length > 0)?.shows[0] ?? null;
  return { latest, seasons, upcomingShowDates: dates };
}

/** What was read on a show, once that show is public on YouTube (null: no public show that day). */
export async function loadShowAnnouncements(dateKey: string) {
  const seasons = await loadPublicSeasons();
  if (!seasons.some((season) => season.shows.some((show) => show.showDate === dateKey))) return null;
  const doc = await prisma.teleprompterDoc.findFirst({
    where: { showDate: new Date(`${dateKey}T12:00:00.000Z`) },
    select: { sections: { where: { label: "A2" }, select: { content: true }, take: 1 } },
    orderBy: { updatedAt: "desc" }
  });
  return { showDate: dateKey, announcements: publicAnnouncements(bulletinParagraphs(doc?.sections[0]?.content ?? "")) };
}

export async function loadPublicLive(now = new Date()) {
  const [uploads, events] = await Promise.all([
    cachedRecentUploads(),
    prisma.livestreamEvent.findMany({
      where: {
        status: "SCHEDULED",
        availability: "PUBLIC",
        startsAt: { gte: new Date(now.getTime() - UPCOMING_EVENT_GRACE_MS) }
      },
      select: { id: true, title: true, startsAt: true, location: true },
      orderBy: { startsAt: "asc" },
      take: 20
    })
  ]);
  const { live, scheduled, recent } = classifyStreams(uploads);
  const liveIds = new Set(live.map((video) => video.videoId));
  const upcoming = mergeUpcoming(events, scheduled).filter((stream) => !stream.videoId || !liveIds.has(stream.videoId));
  return { live, upcoming, recent };
}
