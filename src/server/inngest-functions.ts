import { refreshAssociateFeedbackDaily } from "@/src/server/associate-feedback-schedule";
import { MediaStatus } from "@prisma/client";
import { deleteBunnyVideo } from "@/src/lib/bunny";
import { isNasVideoId, nasDelete } from "@/src/lib/nas-storage";
import { inngest } from "@/src/lib/inngest";
import { prisma } from "@/src/lib/prisma";
import { recomputeForProjectName } from "@/src/server/cycle-cut-status";
import { runEquipmentOverdueJob } from "@/src/server/equipment-overdue";
import { runConfiguredHubBackup } from "@/src/server/hub-backup-run";
import { getPendingMasterCalendarSyncMonths, syncMasterCalendarMonth } from "@/src/server/master-calendar-sync";
import { notifyManagersOfReadyVersion } from "@/src/server/notify-media-ready";
import { discoverYoutubePublications, publishYoutubePackage } from "@/src/server/youtube-publishing-jobs";

type BunnyWebhookEvent = {
  videoGuid?: string;
  guid?: string;
  status?: string;
  state?: string;
  encodeProgress?: number;
  duration?: number;
  width?: number;
  height?: number;
};

function mapWebhookToStatus(payload: BunnyWebhookEvent): MediaStatus {
  const status = `${payload.status ?? payload.state ?? ""}`.toLowerCase();

  if (status.includes("fail") || status.includes("error")) {
    return MediaStatus.FAILED;
  }

  if (status.includes("ready") || status.includes("complete") || status.includes("finished")) {
    return MediaStatus.READY;
  }

  return MediaStatus.PROCESSING;
}

export const bunnyWebhookProcessed = inngest.createFunction(
  {
    id: "bunny-webhook-processed"
  },
  { event: "bunny/webhook.received" },
  async ({ event, step }) => {
    const payload = event.data as BunnyWebhookEvent;
    const videoGuid = payload.videoGuid ?? payload.guid;

    if (!videoGuid) {
      return { skipped: true };
    }

    const version = await prisma.mediaVersion.findUnique({
      where: { bunnyVideoId: videoGuid },
      include: { mediaItem: { include: { project: true, folder: true } } }
    });

    if (!version) {
      return { skipped: true };
    }

    const previousStatus = version.status;
    const status = mapWebhookToStatus(payload);

    const data = {
      status,
      durationSeconds:
        typeof payload.duration === "number" && payload.duration >= 0 ? payload.duration : undefined,
      width: typeof payload.width === "number" ? payload.width : undefined,
      height: typeof payload.height === "number" ? payload.height : undefined
    };

    let claimedReady = false;
    if (status === MediaStatus.READY && previousStatus !== MediaStatus.READY) {
      const result = await prisma.mediaVersion.updateMany({
        where: { id: version.id, status: { not: MediaStatus.READY } },
        data
      });
      claimedReady = result.count > 0;
    } else {
      await prisma.mediaVersion.update({ where: { id: version.id }, data });
    }

    await prisma.activityEvent.create({
      data: {
        workspaceId: version.mediaItem.project.workspaceId,
        projectId: version.mediaItem.project.id,
        mediaItemId: version.mediaItemId,
        mediaVersionId: version.id,
        type: "media.version.status.updated",
        payload: { status }
      }
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: version.mediaItem.project.workspaceId,
        projectId: version.mediaItem.project.id,
        mediaItemId: version.mediaItemId,
        mediaVersionId: version.id,
        action: "media.version.status.update",
        targetType: "MediaVersion",
        targetId: version.id,
        metadata: { status }
      }
    });

    if (claimedReady) {
      // Notifications wrapped in step.run so they retry independently if delivery fails
      // (we've already atomically claimed the version, so retry-from-start would skip them).
      await step.run("notify-managers-on-ready", async () => {
        await notifyManagersOfReadyVersion(version.id);
        await recomputeForProjectName(version.mediaItem.project.name);
      });
    }

    return { updated: true, status };
  }
);

export const purgeExpiredTrash = inngest.createFunction(
  {
    id: "purge-expired-trash"
  },
  {
    cron: "0 4 * * *"
  },
  async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const staleMedia = await prisma.mediaItem.findMany({
      where: { deletedAt: { not: null, lte: cutoff } },
      include: {
        project: { select: { id: true, workspaceId: true } },
        versions: { select: { bunnyVideoId: true, nasPath: true, storageProvider: true } }
      },
      take: 200
    });

    if (staleMedia.length === 0) {
      return { purged: 0 };
    }

    let purged = 0;
    for (const media of staleMedia) {
      try {
        for (const version of media.versions) {
          if (version.storageProvider === "NAS" || isNasVideoId(version.bunnyVideoId)) {
            if (version.nasPath) await nasDelete(version.nasPath);
          } else {
            await deleteBunnyVideo(version.bunnyVideoId);
          }
        }

        await prisma.mediaItem.delete({ where: { id: media.id } });

        await prisma.activityEvent.create({
          data: {
            workspaceId: media.project.workspaceId,
            projectId: media.project.id,
            type: "media.permanently_deleted",
            payload: { mediaId: media.id, source: "retention", title: media.title }
          }
        });

        await prisma.auditLog.create({
          data: {
            workspaceId: media.project.workspaceId,
            projectId: media.project.id,
            action: "media.permanent_delete.retention",
            targetType: "MediaItem",
            targetId: media.id,
            metadata: { title: media.title, deletedAt: media.deletedAt }
          }
        });

        purged += 1;
      } catch (error) {
        console.error(`purge-expired-trash: failed to purge media ${media.id}`, error);
      }
    }

    return { purged };
  }
);

export const purgeStaleVideoVersions = inngest.createFunction(
  {
    id: "purge-stale-video-versions"
  },
  {
    cron: "15 4 * * *"
  },
  async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const staleMedia = await prisma.mediaItem.findMany({
      where: {
        deletedAt: null,
        currentVersionId: { not: null },
        currentVersion: { sourceType: "VIDEO", createdAt: { lte: cutoff } },
        versions: { some: { sourceType: "VIDEO" } }
      },
      select: {
        id: true,
        title: true,
        currentVersionId: true,
        project: { select: { id: true, workspaceId: true } },
        versions: {
          where: { sourceType: "VIDEO" },
          orderBy: { versionNumber: "desc" },
          select: {
            id: true,
            bunnyVideoId: true,
            versionNumber: true,
            nasPath: true,
            storageProvider: true
          }
        }
      },
      take: 200
    });

    if (staleMedia.length === 0) {
      return { prunedMedia: 0, prunedVersions: 0 };
    }

    let prunedMedia = 0;
    let prunedVersions = 0;

    for (const media of staleMedia) {
      const versionsToDelete = media.versions.filter((version) => version.id !== media.currentVersionId);
      if (versionsToDelete.length === 0) continue;

      try {
        for (const version of versionsToDelete) {
          if (version.storageProvider === "NAS" || isNasVideoId(version.bunnyVideoId)) {
            if (version.nasPath) await nasDelete(version.nasPath);
          } else {
            await deleteBunnyVideo(version.bunnyVideoId);
          }
        }

        const deleted = await prisma.mediaVersion.deleteMany({
          where: {
            id: { in: versionsToDelete.map((version) => version.id) },
            mediaItemId: media.id,
            sourceType: "VIDEO"
          }
        });

        await prisma.activityEvent.create({
          data: {
            workspaceId: media.project.workspaceId,
            projectId: media.project.id,
            mediaItemId: media.id,
            mediaVersionId: media.currentVersionId,
            type: "media.version.retention.purged",
            payload: {
              keptVersionId: media.currentVersionId,
              removedVersionCount: deleted.count,
              removedVersionNumbers: versionsToDelete.map((version) => version.versionNumber)
            }
          }
        });

        await prisma.auditLog.create({
          data: {
            workspaceId: media.project.workspaceId,
            projectId: media.project.id,
            mediaItemId: media.id,
            mediaVersionId: media.currentVersionId,
            action: "media.version.retention.purge",
            targetType: "MediaItem",
            targetId: media.id,
            metadata: {
              keptVersionId: media.currentVersionId,
              removedVersionIds: versionsToDelete.map((version) => version.id),
              removedVersionNumbers: versionsToDelete.map((version) => version.versionNumber),
              title: media.title
            }
          }
        });

        if (deleted.count > 0) {
          prunedMedia += 1;
          prunedVersions += deleted.count;
        }
      } catch (error) {
        console.error(`purge-stale-video-versions: failed to prune media ${media.id}`, error);
      }
    }

    return { prunedMedia, prunedVersions };
  }
);

export const autoSyncMasterCalendar = inngest.createFunction(
  {
    // Renamed from "master-calendar-auto-sync" to force fresh registration in Inngest —
    // the prior ID had a stuck every-minute schedule somewhere in the registry.
    id: "master-calendar-auto-sync-daily"
  },
  {
    cron: "0 9 * * *"
  },
  async () => {
    const pendingMonths = (await getPendingMasterCalendarSyncMonths()).slice(0, 3);

    if (pendingMonths.length === 0) {
      return { synced: 0, pending: 0 };
    }

    const results: Array<{ monthKey: string; synced: boolean; entryCount?: number; error?: string }> = [];
    for (const monthKey of pendingMonths) {
      try {
        const synced = await syncMasterCalendarMonth(monthKey);
        results.push({ monthKey, synced: true, entryCount: synced.entryCount });
      } catch (error) {
        results.push({
          monthKey,
          synced: false,
          error: error instanceof Error ? error.message : "Unknown sync error"
        });
      }
    }

    return {
      checked: pendingMonths.length,
      synced: results.filter((result) => result.synced).length,
      results
    };
  }
);

export const equipmentOverdueDaily = inngest.createFunction(
  {
    id: "equipment-overdue-daily"
  },
  {
    cron: "0 16 * * *"
  },
  async () => {
    return runEquipmentOverdueJob();
  }
);

export const hubDbBackupHourly = inngest.createFunction(
  {
    id: "hub-db-backup-hourly",
    concurrency: 1
  },
  [{ cron: "0 * * * *" }, { event: "hub/backup.requested" }],
  async () => {
    return runConfiguredHubBackup();
  }
);

export const inngestFunctions = [
  discoverYoutubePublications,
  publishYoutubePackage,
  bunnyWebhookProcessed,
  purgeExpiredTrash,
  purgeStaleVideoVersions,
  autoSyncMasterCalendar,
  equipmentOverdueDaily,
  hubDbBackupHourly,
  refreshAssociateFeedbackDaily
];
