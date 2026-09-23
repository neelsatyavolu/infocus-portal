import { MediaStatus } from "@prisma/client";
import { deriveMediaStatusFromBunnyVideo, getBunnyVideo } from "@/src/lib/bunny";
import { prisma } from "@/src/lib/prisma";
import { notifyManagersOfReadyVersion } from "@/src/server/notify-media-ready";

const PENDING_STATUSES: MediaStatus[] = [MediaStatus.UPLOADING, MediaStatus.PROCESSING];

export async function reconcileProjectMediaStatuses(projectId: string) {
  const versions = await prisma.mediaVersion.findMany({
    where: {
      mediaItem: {
        projectId
      },
      status: {
        in: PENDING_STATUSES
      }
    },
    select: {
      id: true,
      mediaItemId: true,
      bunnyVideoId: true,
      status: true
    },
    take: 50
  });

  if (versions.length === 0) {
    return;
  }

  await Promise.all(
    versions.map(async (version) => {
      const bunnyVideo = await getBunnyVideo(version.bunnyVideoId);

      if (!bunnyVideo) {
        const [versionCount, commentCount] = await Promise.all([
          prisma.mediaVersion.count({ where: { mediaItemId: version.mediaItemId } }),
          prisma.reviewComment.count({ where: { mediaVersionId: version.id } })
        ]);

        if (versionCount === 1 && commentCount === 0) {
          await prisma.mediaItem.delete({
            where: { id: version.mediaItemId }
          });
          return;
        }

        if (version.status !== MediaStatus.FAILED) {
          await prisma.mediaVersion.update({
            where: { id: version.id },
            data: { status: MediaStatus.FAILED }
          });
        }

        return;
      }

      const nextStatus = deriveMediaStatusFromBunnyVideo(bunnyVideo);

      if (nextStatus === version.status) {
        return;
      }

      const updateData = {
        status: nextStatus,
        durationSeconds: bunnyVideo.length,
        width: bunnyVideo.width,
        height: bunnyVideo.height
      };

      if (nextStatus === MediaStatus.READY && version.status !== MediaStatus.READY) {
        // Atomic claim so concurrent reconcile calls cannot both fire the notification.
        const claimed = await prisma.mediaVersion.updateMany({
          where: {
            id: version.id,
            status: { not: MediaStatus.READY }
          },
          data: updateData
        });

        if (claimed.count > 0) {
          try {
            await notifyManagersOfReadyVersion(version.id);
          } catch (error) {
            console.error("notifyManagersOfReadyVersion (reconcile) failed", error);
          }
        }
        return;
      }

      await prisma.mediaVersion.update({
        where: { id: version.id },
        data: updateData
      });
    })
  );
}
