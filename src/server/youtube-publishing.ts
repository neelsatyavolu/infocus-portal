import { prisma } from "@/src/lib/prisma";
import { resolveOriginalDownloadUrl } from "@/src/lib/media-playback";
import { isPublicationDue, publicationDateKey } from "@/src/lib/youtube-publication";
import { beginYoutubeUpload, checkYoutubeVideo, PublicationError, readUploadProgress, sourceVideoSize,
  uploadYoutubeChunk, verifyYoutubeChannel, youtubeAccessToken, youtubePublishingConfig } from "@/src/server/youtube-client";
import { deliverPublicationEmails, publicationEmailPayload } from "@/src/server/youtube-publication-email";

export async function dueYoutubePackageIds(now = new Date(), afterId?: string) {
  const config = youtubePublishingConfig();
  if (!config) return [];
  const rows = await prisma.packageProgressRow.findMany({
    where: { OR: [
      { queuedForAirAt: { not: null }, queuedForShowDate: { gte: config.startDate, lte: publicationDateKey(now) },
        OR: [{ youtubePublication: null }, { youtubePublication: { status: { in: ["UPLOADING", "PROCESSING"] } } }] },
      { youtubePublication: { status: "PUBLISHED", emails: { some: { sentAt: null, cancelledAt: null } } } }
    ] },
    select: { id: true }, orderBy: { id: "asc" }, take: 100,
    ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {})
  });
  return rows.map((row) => row.id);
}

/** One bounded chunk/processing check. Called only by the per-row serialized Inngest worker. */
export async function advanceYoutubePublication(rowId: string, now = new Date()): Promise<{ more: boolean }> {
  const config = youtubePublishingConfig();
  if (!config) return { more: false };
  const row = await prisma.packageProgressRow.findUnique({ where: { id: rowId }, include: {
    youtubePublication: true, finalCutMediaItem: { include: { currentVersion: true } }
  } });
  if (!row) return { more: false };
  let publication = row.youtubePublication;
  if (publication?.status === "PUBLISHED") {
    await deliverPublicationEmails(publication.id, now);
    return { more: false };
  }
  if (!row.queuedForAirAt || !row.queuedForShowDate ||
      !isPublicationDue(row.queuedForShowDate, config.startDate, config.hour, now) || publication?.status === "FAILED") {
    return { more: false };
  }
  if (publication && publication.showDate !== row.queuedForShowDate) {
    await prisma.youtubePublication.update({ where: { id: publication.id },
      data: { lastError: "Air date changed during upload. Reconcile the existing upload before resuming.", status: "FAILED" } });
    return { more: false };
  }
  if (!publication) {
    const source = row.finalCutMediaItem?.currentVersion;
    if (!source || source.status !== "READY" || source.sourceType !== "VIDEO" || row.finalCutMediaItem?.deletedAt) return { more: false };
    publication = await prisma.youtubePublication.upsert({ where: { rowId }, update: {}, create: {
      rowId, title: row.groupTopic || "Untitled package", showDate: row.queuedForShowDate,
      mediaVersionId: source.id, channelId: config.channelId
    } });
  }
  try {
    if (publication.channelId !== config.channelId) throw new PublicationError("Publishing channel changed during upload.", true);
    const token = await youtubeAccessToken();
    if (publication.videoId) {
      if (!await checkYoutubeVideo(publication.videoId, token, publication.channelId)) return { more: false };
      const managers = await prisma.publishingManager.findMany({ select: { userId: true, user: { select: { email: true } } } });
      const recipients = new Map(managers.flatMap(({ userId, user }) => user.email
        ? [[user.email.trim().toLowerCase(), userId] as const] : []));
      const ready = { ...publication, videoId: publication.videoId };
      // Publishing status and outbox are committed together, so a crash cannot lose notifications.
      await prisma.youtubePublication.update({ where: { id: publication.id }, data: {
        status: "PUBLISHED", publishedAt: now, lastError: null,
        emails: { createMany: { data: [...recipients].map(([recipient, recipientUserId]) => ({ recipient, recipientUserId, payload: publicationEmailPayload(ready, recipient) })), skipDuplicates: true } }
      } });
      await deliverPublicationEmails(publication.id, now);
      return { more: false };
    }
    if (publication.uploadSessionUrl && publication.sourceSize) {
      const size = Number(publication.sourceSize);
      const progress = await readUploadProgress(publication.uploadSessionUrl, token, size);
      if (progress.videoId) {
        await prisma.youtubePublication.update({ where: { id: publication.id }, data: { videoId: progress.videoId, status: "PROCESSING", lastError: null } });
        return { more: true };
      }
      if (progress.offset === size) return { more: false };
      const version = await prisma.mediaVersion.findUnique({ where: { id: publication.mediaVersionId } });
      if (!version) throw new PublicationError("The original Final Cut version is no longer available.", true);
      const sourceUrl = await resolveOriginalDownloadUrl(version);
      if (!sourceUrl) throw new PublicationError("Final Cut download is unavailable.");
      const result = await uploadYoutubeChunk({ sourceUrl, sessionUrl: publication.uploadSessionUrl, token, size, offset: progress.offset });
      await prisma.youtubePublication.update({ where: { id: publication.id }, data: {
        lastError: null, ...(result.videoId ? { videoId: result.videoId, status: "PROCESSING" } : {})
      } });
      return { more: true };
    }
    await verifyYoutubeChannel(token, publication.channelId);
    const version = await prisma.mediaVersion.findUnique({ where: { id: publication.mediaVersionId } });
    if (!version) throw new PublicationError("The original Final Cut version is no longer available.", true);
    const sourceUrl = await resolveOriginalDownloadUrl(version);
    if (!sourceUrl) throw new PublicationError("Final Cut download is unavailable.");
    const size = await sourceVideoSize(sourceUrl);
    const sessionUrl = await beginYoutubeUpload(token, size, publication.title, publication.showDate);
    // Save the session before sending any bytes. A lost init response cannot create a duplicate completed video.
    await prisma.youtubePublication.update({ where: { id: publication.id }, data: { sourceSize: BigInt(size), uploadSessionUrl: sessionUrl, lastError: null } });
    return { more: true };
  } catch (error) {
    const known = error instanceof PublicationError;
    await prisma.youtubePublication.update({ where: { id: publication.id }, data: {
      lastError: known ? error.message : "Publication interrupted; retry pending. Check publishing configuration if this persists.",
      ...(known && error.permanent ? { status: "FAILED" } : {})
    } });
    return { more: false };
  }
}
