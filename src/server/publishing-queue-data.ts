import { prisma } from "@/src/lib/prisma";
import { resolveThumbnailUrl } from "@/src/lib/media-playback";
import { finalCutHeadline } from "@/src/lib/package-headline";
import { isCustomQueuePackage } from "@/src/lib/publishing-queue";
import { labeledUser, userDisplayName } from "@/src/lib/user-display";
import { formatShowDateLabel, todayDateKey } from "@/src/lib/show-assignment";
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
export async function loadPublishingQueue({ canEdit, wantCandidates }: { canEdit: boolean; wantCandidates: boolean }) {
  const [rows, upcoming, candidates] = await Promise.all([
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
    listUpcomingShowDays(13),
    wantCandidates
      ? prisma.packageProgressRow.findMany({
          where: {
            queuedForAirAt: null,
            finalCutMediaItemId: { not: null },
            groupTopic: { not: "" }
          },
          include: {
            members: { include: { user: { select: { name: true, nickname: true, email: true } } } }
          },
          orderBy: [{ cycleNumber: "desc" }, { rowOrder: "asc" }],
          take: 40
        })
      : Promise.resolve([])
  ]);

  return {
    canEdit,
    publishingConfigured: Boolean(youtubePublishingConfig()),
    packages: await Promise.all(rows.map(mapQueueRow)),
    today: todayDateKey(),
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
      members: row.members.map((member) => userDisplayName(member.user) || member.user.email)
    }))
  };
}
