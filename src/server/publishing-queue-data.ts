import { prisma } from "@/src/lib/prisma";
import { resolveThumbnailUrl } from "@/src/lib/media-playback";
import { finalCutHeadline } from "@/src/lib/package-headline";
import { QUEUE_UPCOMING_SHOW_COUNT, isCustomQueuePackage } from "@/src/lib/publishing-queue";
import { labeledUser, userDisplayName } from "@/src/lib/user-display";
import { formatShowDateLabel, todayDateKey } from "@/src/lib/show-assignment";
import { loadOverflowProjection } from "@/src/server/publishing-queue-projection";
import { listUpcomingShowDays } from "@/src/server/show-schedule";
import { anchorModeForDate } from "@/src/show-roles/lib/anchors";
import { youtubePublishingConfig } from "@/src/server/youtube-client";

async function mapQueueRow(row: {
  id: string;
  cycleNumber: number;
  groupTopic: string;
  groupType?: string | null;
  queuedForAirAt: Date | null;
  queuedForShowDate: string | null;
  finalCutMediaItemId: string | null;
  youtubePublication: { status: string; videoId: string | null; publishedAt: Date | null; lastError: string | null } | null;
  assignedProducer: { name: string | null; nickname?: string | null; email: string | null } | null;
  members: Array<{ user: { name: string | null; nickname?: string | null; email: string | null } }>;
  finalCutMediaItem: {
    title: string;
    currentVersion: {
      bunnyVideoId: string;
      storageProvider: string;
      nasPath: string | null;
      sourceType: string;
      status: string;
    } | null;
  } | null;
}) {
  const version = row.finalCutMediaItem?.currentVersion;
  return {
    id: row.id,
    cycleNumber: row.cycleNumber,
    groupTopic: row.groupTopic,
    headline: finalCutHeadline(row.finalCutMediaItem),
    custom: isCustomQueuePackage(row),
    queuedForAirAt: row.queuedForAirAt?.toISOString() ?? null,
    queuedForShowDate: row.queuedForShowDate,
    hasFinalCut: Boolean(row.finalCutMediaItemId),
    youtubePublication: row.youtubePublication ? {
      ...row.youtubePublication,
      publishedAt: row.youtubePublication.publishedAt?.toISOString() ?? null
    } : null,
    assignedProducer: row.assignedProducer ? labeledUser(row.assignedProducer) : null,
    members: row.members.map((member) => userDisplayName(member.user) || member.user.email),
    thumbnailUrl: version ? await resolveThumbnailUrl(version) : null
  };
}

/**
 * GET /api/package-cycle/queue after its access check (the Publishing Queue page loads it too,
 * for first paint). `canEdit` is for producers; candidates only ever go to them.
 */
export async function loadPublishingQueue({
  canEdit,
  canHold,
  wantCandidates
}: {
  canEdit: boolean;
  /** EP, adviser or super admin: may hold a show day (it sets the calendar label). */
  canHold: boolean;
  wantCandidates: boolean;
}) {
  const [rows, upcoming, candidates, overflow] = await Promise.all([
    prisma.packageProgressRow.findMany({
      where: { queuedForAirAt: { not: null } },
      include: {
        youtubePublication: { select: { status: true, videoId: true, publishedAt: true, lastError: true } },
        members: { include: { user: { select: { name: true, nickname: true, email: true } } } },
        assignedProducer: { select: { name: true, nickname: true, email: true } },
        finalCutMediaItem: {
          select: {
            title: true,
            currentVersion: {
              select: {
                bunnyVideoId: true,
                storageProvider: true,
                nasPath: true,
                sourceType: true,
                status: true
              }
            }
          }
        }
      },
      orderBy: [{ queuedForShowDate: "asc" }, { queuedForAirAt: "desc" }]
    }),
    listUpcomingShowDays(QUEUE_UPCOMING_SHOW_COUNT),
    wantCandidates
      ? prisma.packageProgressRow.findMany({
          where: {
            queuedForAirAt: null,
            groupTopic: { not: "" }
          },
          include: {
            members: { include: { user: { select: { name: true, nickname: true, email: true } } } }
          },
          orderBy: [{ cycleNumber: "desc" }, { rowOrder: "asc" }],
          take: 40
        })
      : Promise.resolve([]),
    // A projection, so a failure leaves the tile out rather than failing the queue.
    canEdit
      ? loadOverflowProjection().catch((error: unknown) => {
          console.error("Publishing Queue overflow projection failed", error);
          return null;
        })
      : Promise.resolve(null)
  ]);

  return {
    canEdit,
    canHold,
    publishingConfigured: Boolean(youtubePublishingConfig()),
    packages: await Promise.all(rows.map(mapQueueRow)),
    today: todayDateKey(),
    overflow,
    upcomingShows: upcoming.map(({ date, label }) => ({
      date,
      label: label ? `${formatShowDateLabel(date)} · ${label}` : formatShowDateLabel(date),
      mode: anchorModeForDate(new Date(`${date}T12:00:00`))
    })),
    candidates: candidates.map((row) => ({
      id: row.id,
      cycleNumber: row.cycleNumber,
      groupTopic: row.groupTopic,
      custom: isCustomQueuePackage(row),
      hasFinalCut: Boolean(row.finalCutMediaItemId),
      members: row.members.map((member) => userDisplayName(member.user) || member.user.email)
    }))
  };
}
