import { isShowCopy, uploadsPlaylistId, type YoutubeVideo } from "@/src/lib/public-feed";
import { youtubeAccessToken, youtubeGet } from "@/src/server/youtube-client";

/** The channel's newest uploads looked at; a show's copy goes up within a day or two of it airing. */
const RECENT_UPLOADS = 50;

function videoIdsOf(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const id = (item as { contentDetails?: { videoId?: unknown } }).contentDetails?.videoId;
    return typeof id === "string" ? [id] : [];
  });
}

/**
 * Whether the show is already on the channel, however it got there (people sometimes upload in YouTube
 * Studio instead of the Portal). Reads the newest uploads with the channel's own sign-in, so scheduled and
 * private videos count. If YouTube can't be asked, says no: the caller goes ahead rather than skip a show.
 */
export async function showCopyOnYoutube(showDate: string): Promise<boolean> {
  const uploads = uploadsPlaylistId(process.env.YOUTUBE_CHANNEL_ID?.trim() ?? "");
  if (!uploads) {
    console.error("show editor: YouTube channel isn't configured; can't check for an uploaded copy", showDate);
    return false;
  }
  try {
    const token = await youtubeAccessToken();
    const listing = await youtubeGet(
      `playlistItems?part=contentDetails&maxResults=${RECENT_UPLOADS}&playlistId=${encodeURIComponent(uploads)}`, token
    );
    const ids = videoIdsOf(listing.items);
    if (ids.length === 0) return false;
    const details = await youtubeGet(`videos?part=snippet,status,liveStreamingDetails&id=${ids.join(",")}`, token);
    const videos = Array.isArray(details.items) ? (details.items as YoutubeVideo[]) : [];
    return videos.some((video) => isShowCopy(video, showDate));
  } catch (error) {
    console.error("show editor: couldn't check YouTube for an uploaded copy", showDate, error);
    return false;
  }
}
