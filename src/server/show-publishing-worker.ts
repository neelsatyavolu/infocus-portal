import type { ShowPublication } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { nasMintDownloadUrl, nasPosterPath } from "@/src/lib/nas-storage";
import { parseSeasonNumber, seasonPlaylistTitle } from "@/src/lib/show-publication";
import {
  addVideoToPlaylist, beginYoutubeShowUpload, checkScheduledYoutubeVideo, createYoutubePlaylist,
  listYoutubePlaylists, playlistHasVideo, PublicationError, readUploadProgress, setYoutubeThumbnail,
  sourceVideoSize, uploadYoutubeChunk, verifyYoutubeChannel, youtubeAccessToken, youtubePublishingConfig
} from "@/src/server/youtube-client";

export const ACTIVE_SHOW_STATUSES = ["UPLOADING", "PROCESSING", "FINALIZING"];
const DOWNLOAD_TTL_SECONDS = 15 * 60;
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;

export async function dueShowPublicationIds() {
  if (!youtubePublishingConfig()) return [];
  const rows = await prisma.showPublication.findMany({
    where: { status: { in: ACTIVE_SHOW_STATUSES } }, select: { id: true }, orderBy: { showDate: "asc" }, take: 20
  });
  return rows.map((row) => row.id);
}

// Returns null when no poster was saved (capture failed); YouTube then keeps its own frame.
async function readPoster(nasPath: string) {
  const url = await nasMintDownloadUrl(nasPosterPath(nasPath), DOWNLOAD_TTL_SECONDS);
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
  } catch {
    throw new PublicationError("Thumbnail download interrupted; retry pending.");
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new PublicationError(`Thumbnail download failed (HTTP ${response.status}).`);
  const bytes = await response.arrayBuffer();
  return bytes.byteLength > 0 && bytes.byteLength <= MAX_THUMBNAIL_BYTES ? bytes : null;
}

async function resolvePlaylistId(token: string, publication: ShowPublication) {
  if (publication.playlistId) return publication.playlistId;
  if (!publication.seasonNumber) throw new PublicationError("No season playlist was chosen.", true);
  const title = seasonPlaylistTitle(publication.seasonNumber);
  const existing = (await listYoutubePlaylists(token))
    .find((playlist) => parseSeasonNumber(playlist.title) === publication.seasonNumber);
  const playlistId = existing?.id ?? await createYoutubePlaylist(token, title);
  // Saved before adding so a retry never creates the season twice.
  await prisma.showPublication.update({ where: { id: publication.id }, data: { playlistId } });
  return playlistId;
}

async function finalize(token: string, publication: ShowPublication & { videoId: string }, now: Date) {
  if (!publication.thumbnailSetAt) {
    const poster = await readPoster(publication.nasPath);
    if (poster) await setYoutubeThumbnail(token, publication.videoId, poster);
    await prisma.showPublication.update({ where: { id: publication.id }, data: { thumbnailSetAt: now } });
  }
  if (!publication.playlistAddedAt) {
    const playlistId = await resolvePlaylistId(token, publication);
    if (!await playlistHasVideo(token, playlistId, publication.videoId)) {
      await addVideoToPlaylist(token, playlistId, publication.videoId);
    }
  }
  await prisma.showPublication.update({ where: { id: publication.id }, data: {
    status: "SCHEDULED", lastError: null, ...(publication.playlistAddedAt ? {} : { playlistAddedAt: now })
  } });
}

async function sendNextChunk(token: string, publication: ShowPublication, sessionUrl: string, size: number) {
  const progress = await readUploadProgress(sessionUrl, token, size);
  if (progress.videoId) {
    await prisma.showPublication.update({ where: { id: publication.id }, data: {
      videoId: progress.videoId, status: "PROCESSING", uploadedBytes: BigInt(size), lastError: null
    } });
    return { more: true };
  }
  if (progress.offset === size) return { more: false };
  const sourceUrl = await nasMintDownloadUrl(publication.nasPath, DOWNLOAD_TTL_SECONDS);
  const result = await uploadYoutubeChunk({ sourceUrl, sessionUrl, token, size, offset: progress.offset });
  await prisma.showPublication.update({ where: { id: publication.id }, data: {
    lastError: null, uploadedBytes: BigInt(result.offset),
    ...(result.videoId ? { videoId: result.videoId, status: "PROCESSING" } : {})
  } });
  return { more: true };
}

async function startUpload(token: string, publication: ShowPublication, channelId: string, now: Date) {
  if (publication.publishAt.getTime() <= now.getTime()) {
    throw new PublicationError("The scheduled time passed before the upload started. Pick a new time and upload again.", true);
  }
  await verifyYoutubeChannel(token, channelId);
  const sourceUrl = await nasMintDownloadUrl(publication.nasPath, DOWNLOAD_TTL_SECONDS);
  const size = await sourceVideoSize(sourceUrl);
  const sessionUrl = await beginYoutubeShowUpload(token, size, {
    title: publication.title, description: publication.description, publishAt: publication.publishAt
  });
  // Save the session before sending any bytes. A lost init response cannot create a duplicate video.
  await prisma.showPublication.update({ where: { id: publication.id }, data: { sourceSize: BigInt(size), uploadedBytes: BigInt(0), uploadSessionUrl: sessionUrl, lastError: null } });
  return { more: true };
}

/** One bounded step. Called only by the serialized Inngest worker. */
export async function advanceShowPublication(id: string, now = new Date()): Promise<{ more: boolean }> {
  const config = youtubePublishingConfig();
  if (!config) return { more: false };
  const publication = await prisma.showPublication.findUnique({ where: { id } });
  if (!publication || !ACTIVE_SHOW_STATUSES.includes(publication.status)) return { more: false };
  try {
    if (publication.channelId !== config.channelId) throw new PublicationError("Publishing channel changed during upload.", true);
    const token = await youtubeAccessToken();
    const { videoId } = publication;
    if (videoId && publication.status === "FINALIZING") {
      await finalize(token, { ...publication, videoId }, now);
      return { more: false };
    }
    if (videoId) {
      if (!await checkScheduledYoutubeVideo(videoId, token, config.channelId)) return { more: false };
      await prisma.showPublication.update({ where: { id }, data: { status: "FINALIZING", lastError: null } });
      return { more: true };
    }
    if (publication.uploadSessionUrl && publication.sourceSize) {
      return await sendNextChunk(token, publication, publication.uploadSessionUrl, Number(publication.sourceSize));
    }
    return await startUpload(token, publication, config.channelId, now);
  } catch (error) {
    const known = error instanceof PublicationError;
    await prisma.showPublication.update({ where: { id }, data: {
      lastError: known ? error.message : "Show upload interrupted; retry pending. Check publishing configuration if this persists.",
      ...(known && error.permanent ? { status: "FAILED" } : {})
    } });
    return { more: false };
  }
}
