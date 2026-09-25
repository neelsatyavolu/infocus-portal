import type { ShowPublication } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { inngest } from "@/src/lib/inngest";
import { extractCalendarAnchors } from "@/src/lib/calendar-show-content";
import { semesterForDate } from "@/src/lib/livestream";
import { buildShowNasPath, isNasStorageEnabled, nasMintDownloadUrl, nasMintUploadSession, nasPosterPath, nasUploadBytes } from "@/src/lib/nas-storage";
import {
  chooseSeason, parseSeasonNumber, SHOW_PUBLISH_TIME, showDescription, showPublishAt, showTitle
} from "@/src/lib/show-publication";
import { userDisplayName } from "@/src/lib/user-display";
import { youtubeWatchUrl } from "@/src/lib/youtube-publication";
import { SHOW_PUBLICATION_EVENT } from "@/src/server/show-publishing-jobs";
import { listYoutubePlaylists, sourceVideoSize, youtubeAccessToken, youtubePublishingConfig } from "@/src/server/youtube-client";

/** User-facing refusal with a plain message (routes turn it into `fail(message, status)`). */
export class ShowUploadError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function semesterLabelFor(dateKey: string) {
  return semesterForDate(new Date(`${dateKey}T12:00:00Z`)).label;
}

async function showCredits(showDate: string) {
  const [entry, show, rows] = await Promise.all([
    prisma.masterCalendarEntry.findUnique({ where: { date: showDate } }),
    prisma.showRolesShow.findUnique({ where: { date: showDate } }),
    prisma.packageProgressRow.findMany({
      where: { queuedForAirAt: { not: null }, queuedForShowDate: showDate },
      include: { members: { include: { user: { select: { name: true, nickname: true, email: true } } } } },
      orderBy: { queuedForAirAt: "asc" }
    })
  ]);
  // Same precedence as The Show overview: Master Calendar anchors win over stored picks.
  const calendarAnchors = entry ? extractCalendarAnchors(entry.content) : [];
  const storedAnchors = Array.isArray(show?.anchors)
    ? show.anchors.filter((name): name is string => typeof name === "string" && name.length > 0)
    : [];
  const reporters = [...new Set(rows.flatMap((row) => row.members.map((member) => userDisplayName(member.user))))];
  const topics = rows.map((row) => row.groupTopic.trim()).filter(Boolean);
  return {
    anchors: calendarAnchors.length > 0 ? calendarAnchors : storedAnchors,
    reporters: reporters.filter(Boolean),
    topics: topics.length <= 2 ? topics.join(" and ") : `${topics.slice(0, -1).join(", ")}, and ${topics.at(-1)}`
  };
}

async function seasonSuggestion(showDate: string) {
  const latest = await prisma.showPublication.findFirst({
    where: { seasonNumber: { not: null }, semesterLabel: { not: null }, status: { not: "DRAFT" } },
    orderBy: { showDate: "desc" }, select: { seasonNumber: true, semesterLabel: true }
  });
  const latestSeason = latest?.seasonNumber && latest.semesterLabel
    ? { seasonNumber: latest.seasonNumber, semesterLabel: latest.semesterLabel } : null;
  let existingSeasons: number[] | null = null;
  if (youtubePublishingConfig()) {
    try {
      const playlists = await listYoutubePlaylists(await youtubeAccessToken());
      existingSeasons = playlists.map((playlist) => parseSeasonNumber(playlist.title))
        .filter((season): season is number => season !== null).sort((a, b) => b - a);
    } catch {
      existingSeasons = null;
    }
  }
  if (!existingSeasons) return { seasonNumber: latestSeason?.seasonNumber ?? null, existingSeasons: null };
  const choice = chooseSeason({
    highestSeason: existingSeasons[0] ?? null, latest: latestSeason, semesterLabel: semesterLabelFor(showDate)
  });
  return { seasonNumber: choice.seasonNumber, existingSeasons };
}

function publicationView(publication: ShowPublication) {
  return {
    status: publication.status,
    title: publication.title,
    description: publication.description,
    publishAt: publication.publishAt.toISOString(),
    seasonNumber: publication.seasonNumber,
    watchUrl: publication.videoId ? youtubeWatchUrl(publication.videoId) : null,
    lastError: publication.lastError
  };
}

/** Popup state: the saved publication (never its upload session) plus draft defaults. */
export async function showPublicationState(showDate: string) {
  const publication = await prisma.showPublication.findUnique({ where: { showDate } });
  const base = { showDate, configured: Boolean(youtubePublishingConfig()), publication: publication ? publicationView(publication) : null };
  if (publication && publication.status !== "DRAFT") return { ...base, defaults: null };
  const [credits, season] = await Promise.all([showCredits(showDate), seasonSuggestion(showDate)]);
  return {
    ...base,
    defaults: {
      title: showTitle(showDate),
      description: showDescription(credits),
      publishDate: showDate,
      publishTime: SHOW_PUBLISH_TIME,
      ...season
    }
  };
}

export async function initShowUpload(input: { userId: string; showDate: string; fileName: string }) {
  if (!isNasStorageEnabled()) throw new ShowUploadError("Drive uploads are required to upload the show.");
  const existing = await prisma.showPublication.findUnique({ where: { showDate: input.showDate } });
  if (existing && existing.status !== "DRAFT") {
    throw new ShowUploadError("This show was already sent to YouTube. Make changes in YouTube Studio.", 409);
  }
  const upload = await nasMintUploadSession(buildShowNasPath({
    showDate: input.showDate, fileName: input.fileName, stamp: Date.now().toString(36)
  }));
  const draft = {
    nasPath: upload.path, title: showTitle(input.showDate), description: "",
    publishAt: showPublishAt(input.showDate), createdById: input.userId
  };
  await prisma.showPublication.upsert({
    where: { showDate: input.showDate }, update: draft, create: { showDate: input.showDate, ...draft }
  });
  return { upload };
}

async function requireDraft(showDate: string) {
  const publication = await prisma.showPublication.findUnique({ where: { showDate } });
  if (!publication) throw new ShowUploadError("Upload the show video first.");
  if (publication.status !== "DRAFT") {
    throw new ShowUploadError("This show was already sent to YouTube. Make changes in YouTube Studio.", 409);
  }
  return publication;
}

export async function saveShowPoster(input: { showDate: string; poster: Blob }) {
  const publication = await requireDraft(input.showDate);
  await nasUploadBytes(nasPosterPath(publication.nasPath), input.poster, "poster.jpg", "image/jpeg");
}

export async function confirmShowPublication(input: {
  userId: string; showDate: string; title: string; description: string;
  publishDate: string; publishTime: string; seasonNumber: number;
}, now = new Date()) {
  const config = youtubePublishingConfig();
  if (!config) throw new ShowUploadError("YouTube publishing is not configured.", 503);
  const publication = await requireDraft(input.showDate);
  const publishAt = showPublishAt(input.publishDate, input.publishTime);
  if (publishAt.getTime() <= now.getTime()) throw new ShowUploadError("Pick a publish time in the future.");
  try {
    await sourceVideoSize(await nasMintDownloadUrl(publication.nasPath, 5 * 60));
  } catch {
    throw new ShowUploadError("The show video is not on InFocus Drive yet. Wait for the upload to finish.");
  }
  const updated = await prisma.showPublication.updateMany({
    where: { id: publication.id, status: "DRAFT" },
    data: {
      status: "UPLOADING", title: input.title, description: input.description, publishAt,
      seasonNumber: input.seasonNumber, semesterLabel: semesterLabelFor(input.publishDate),
      channelId: config.channelId, confirmedById: input.userId, confirmedAt: now, lastError: null
    }
  });
  if (updated.count === 0) throw new ShowUploadError("This show was already sent to YouTube.", 409);
  await inngest.send({ name: SHOW_PUBLICATION_EVENT, data: { id: publication.id } });
  return showPublicationState(input.showDate);
}
