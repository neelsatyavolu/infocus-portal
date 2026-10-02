import { parseSeasonNumber } from "@/src/lib/show-publication";

/** Public InFocus iPhone app feeds: response shapes and pure helpers (YouTube → shows and livestreams). */

export type PublicShow = {
  videoId: string;
  title: string;
  /** Pacific air date read from the title ("InFocus News | Friday, September 25th, 2026"). */
  showDate: string | null;
  publishedAt: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
};

export type PublicSeason = { number: number; title: string; playlistId: string; shows: PublicShow[] };

export type PublicLiveVideo = {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  startedAt: string | null;
  endedAt: string | null;
};

export type PublicUpcomingStream = {
  id: string;
  title: string;
  startsAt: string;
  location: string | null;
  videoId: string | null;
};

/** The Data API `videos` fields these feeds read. */
export type YoutubeVideo = {
  id: string;
  snippet?: {
    title?: string;
    publishedAt?: string;
    liveBroadcastContent?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
  contentDetails?: { duration?: string };
  status?: { privacyStatus?: string; uploadStatus?: string };
  liveStreamingDetails?: { actualStartTime?: string; actualEndTime?: string; scheduledStartTime?: string };
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
];
const TITLE_DATE = new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "i");
const DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;
const THUMBNAIL_SIZES = ["maxres", "standard", "high", "medium", "default"];
/** A YouTube stream and a calendar livestream this close together are the same event. */
const SAME_EVENT_MS = 3 * 60 * 60 * 1000;
export const RECENT_STREAM_LIMIT = 20;

export function showDateFromTitle(title: string): string | null {
  const match = TITLE_DATE.exec(title);
  if (!match) return null;
  const month = MONTHS.indexOf(match[1]!.toLowerCase()) + 1;
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** ISO 8601 duration ("PT12M22S") → seconds; null for live streams ("P0D") and junk. */
export function durationSeconds(iso: string | undefined): number | null {
  const match = iso ? DURATION.exec(iso) : null;
  if (!match) return null;
  const [days, hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0));
  const total = days! * 86400 + hours! * 3600 + minutes! * 60 + seconds!;
  return total > 0 ? total : null;
}

export function thumbnailUrl(video: YoutubeVideo) {
  const thumbnails = video.snippet?.thumbnails ?? {};
  for (const size of THUMBNAIL_SIZES) {
    const url = thumbnails[size]?.url;
    if (url) return url;
  }
  return `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
}

function isPublic(video: YoutubeVideo) {
  return video.status?.privacyStatus === "public";
}

/** Public, finished uploads: scheduled, private, unlisted and still-processing videos stay hidden. */
export function isPublicShowVideo(video: YoutubeVideo) {
  return isPublic(video) && video.status?.uploadStatus === "processed" && video.snippet?.liveBroadcastContent !== "upcoming";
}

export function toPublicShow(video: YoutubeVideo): PublicShow {
  const title = video.snippet?.title?.trim() || "InFocus News";
  return {
    videoId: video.id,
    title,
    showDate: showDateFromTitle(title),
    publishedAt: video.snippet?.publishedAt ?? new Date(0).toISOString(),
    thumbnailUrl: thumbnailUrl(video),
    durationSeconds: durationSeconds(video.contentDetails?.duration)
  };
}

/** Newest first: by air date, then upload time. */
export function sortShowsNewestFirst(shows: PublicShow[]) {
  const key = (show: PublicShow) => `${show.showDate ?? show.publishedAt.slice(0, 10)}|${show.publishedAt}`;
  return [...shows].sort((left, right) => key(right).localeCompare(key(left)));
}

/** `InFocus News | Season N` playlists, newest season first. */
export function seasonPlaylists(playlists: { id: string; title: string }[]) {
  return playlists
    .flatMap((playlist) => {
      const number = parseSeasonNumber(playlist.title);
      return number === null ? [] : [{ number, title: playlist.title, playlistId: playlist.id }];
    })
    .sort((left, right) => right.number - left.number);
}

/** A channel's uploads playlist ("UC…" → "UU…"). */
export function uploadsPlaylistId(channelId: string) {
  return channelId.startsWith("UC") ? `UU${channelId.slice(2)}` : null;
}

function toLiveVideo(video: YoutubeVideo): PublicLiveVideo {
  return {
    videoId: video.id,
    title: video.snippet?.title?.trim() || "InFocus Live",
    thumbnailUrl: thumbnailUrl(video),
    startedAt: video.liveStreamingDetails?.actualStartTime ?? null,
    endedAt: video.liveStreamingDetails?.actualEndTime ?? null
  };
}

/** Sorts the channel's recent public streams into live now, scheduled, and ended. */
export function classifyStreams(videos: YoutubeVideo[]) {
  const streams = videos.filter((video) => isPublic(video) && video.liveStreamingDetails);
  const live = streams.filter((video) => video.snippet?.liveBroadcastContent === "live").map(toLiveVideo);
  const scheduled = streams
    .filter((video) => video.snippet?.liveBroadcastContent === "upcoming" && video.liveStreamingDetails?.scheduledStartTime)
    .map((video) => ({
      videoId: video.id,
      title: video.snippet?.title?.trim() || "InFocus Live",
      startsAt: video.liveStreamingDetails!.scheduledStartTime!
    }));
  const recent = streams
    .filter((video) => video.liveStreamingDetails?.actualEndTime)
    .map(toLiveVideo)
    .sort((left, right) => (right.endedAt ?? "").localeCompare(left.endedAt ?? ""))
    .slice(0, RECENT_STREAM_LIMIT);
  return { live, scheduled, recent };
}

/**
 * One upcoming list from the Portal's livestream calendar and YouTube's scheduled streams.
 * A scheduled stream within a few hours of a calendar event lends that event its video.
 */
export function mergeUpcoming(
  events: { id: string; title: string; startsAt: Date; location: string }[],
  scheduled: { videoId: string; title: string; startsAt: string }[]
): PublicUpcomingStream[] {
  const unmatched = [...scheduled];
  const fromCalendar = events.map((event) => {
    const index = unmatched.findIndex(
      (stream) => Math.abs(Date.parse(stream.startsAt) - event.startsAt.getTime()) <= SAME_EVENT_MS
    );
    const match = index >= 0 ? unmatched.splice(index, 1)[0] : undefined;
    return {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      location: event.location.trim() || null,
      videoId: match?.videoId ?? null
    };
  });
  const fromYoutube = unmatched.map((stream) => ({
    id: stream.videoId,
    title: stream.title,
    startsAt: stream.startsAt,
    location: null,
    videoId: stream.videoId
  }));
  return [...fromCalendar, ...fromYoutube].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

/**
 * Announcement paragraphs fit for the public. Unfilled placeholders (`[INSERT …]`, `{…}`) drop
 * the paragraph; bracketed speaker cues (`[Sage]`) are removed, and bracketed links kept as text.
 */
export function publicAnnouncements(paragraphs: string[]) {
  return paragraphs.flatMap((paragraph) => {
    if (/\[\s*INSERT\b[^\]]*\]|\{[^}]*\}/i.test(paragraph)) return [];
    const text = paragraph
      .replace(/\[\s*(https?:\/\/[^\]\s]+)\s*\]/gi, "$1")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\s+([,.!?;:])/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    return text ? [text] : [];
  });
}
