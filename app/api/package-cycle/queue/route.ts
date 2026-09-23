import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { resolveThumbnailUrl } from "@/src/lib/media-playback";
import { isCustomQueuePackage } from "@/src/lib/publishing-queue";
import { labeledUser, userDisplayName } from "@/src/lib/user-display";
import { DATE_KEY_PATTERN, formatShowDateLabel, todayDateKey } from "@/src/lib/show-assignment";
import { setQueuedForAir } from "@/src/server/publishing-queue";
import { listUpcomingShows } from "@/src/server/show-schedule";
import { anchorModeForDate } from "@/src/show-roles/lib/anchors";
import { youtubePublishingConfig } from "@/src/server/youtube-client";

const schema = z.object({
  rowId: z.string().min(1),
  queued: z.boolean(),
  showDate: z.string().regex(DATE_KEY_PATTERN).nullable().optional()
});

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

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const wantCandidates = new URL(request.url).searchParams.get("candidates") === "1";
    const [rows, upcoming, candidates] = await Promise.all([
      prisma.packageProgressRow.findMany({
        where: { queuedForAirAt: { not: null } },
        include: {
          youtubePublication: { select: { status: true, videoId: true, publishedAt: true, lastError: true } },
          members: { include: { user: { select: { name: true, nickname: true, email: true } } } },
          assignedProducer: { select: { name: true, nickname: true, email: true } },
          finalCutMediaItem: {
            select: {
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
      listUpcomingShows(10),
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

    return ok({
      publishingConfigured: Boolean(youtubePublishingConfig()),
      packages: await Promise.all(rows.map(mapQueueRow)),
      today: todayDateKey(),
      upcomingShows: upcoming.map((date) => ({
        date,
        label: formatShowDateLabel(date),
        mode: anchorModeForDate(new Date(`${date}T12:00:00`))
      })),
      candidates: candidates.map((row) => ({
        id: row.id,
        cycleNumber: row.cycleNumber,
        groupTopic: row.groupTopic,
        custom: isCustomQueuePackage(row),
        members: row.members.map((member) => userDisplayName(member.user) || member.user.email)
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const payload = schema.parse(await request.json());
    const row = await setQueuedForAir(payload.rowId, payload.queued, payload.showDate);
    return ok({
      ok: true,
      queuedForShowDate: row.queuedForShowDate,
      queuedForAirAt: row.queuedForAirAt?.toISOString() ?? null
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
