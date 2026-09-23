import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { syncTurnedInDateForUpload } from "@/src/server/package-grade-auto-turn-in";
import { requireProjectRole } from "@/src/server/memberships";

const requestSchema = z.object({
  folderId: z.string().cuid().nullable().optional(),
  mediaId: z.string().cuid().optional()
});

function isFinalCutFolderName(name: string) {
  return name.trim().toLowerCase() === "final cut";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const payload = requestSchema.parse(await request.json());

    await requireProjectRole(projectId, undefined, { allowVisibility: true });

    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const platformAccess = await getPlatformAccess(user.email);
    if (!hasPlatformRole(platformAccess.role, "EXECUTIVE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    if (payload.mediaId) {
      const mediaItem = await prisma.mediaItem.findFirst({
        where: {
          id: payload.mediaId,
          projectId,
          deletedAt: null
        },
        select: {
          id: true,
          folder: {
            select: {
              name: true
            }
          },
          currentVersion: {
            select: {
              createdAt: true,
              sourceType: true
            }
          }
        }
      });

      if (!mediaItem) {
        throw new Error("BAD_REQUEST");
      }

      if (!mediaItem.folder || !isFinalCutFolderName(mediaItem.folder.name)) {
        return fail("Sync is only available for videos in the Final Cut folder.", 400);
      }

      if (!mediaItem.currentVersion || mediaItem.currentVersion.sourceType !== "VIDEO") {
        return ok({
          processedVideoCount: 0,
          syncedTurnedInRows: 0
        });
      }

      const syncedTurnedInRows = await syncTurnedInDateForUpload(mediaItem.id, mediaItem.currentVersion.createdAt);

      return ok({
        processedVideoCount: 1,
        syncedTurnedInRows
      });
    }

    if (!payload.folderId) {
      return fail("Sync is only available in the Final Cut folder.", 400);
    }

    if (payload.folderId) {
      const folder = await prisma.projectFolder.findFirst({
        where: {
          id: payload.folderId,
          projectId
        },
        select: {
          name: true
        }
      });

      if (!folder) {
        throw new Error("BAD_REQUEST");
      }

      if (!isFinalCutFolderName(folder.name)) {
        return fail("Sync is only available in the Final Cut folder.", 400);
      }
    }

    const mediaItems = await prisma.mediaItem.findMany({
      where: {
        projectId,
        deletedAt: null,
        folderId: payload.folderId
      },
      select: {
        id: true,
        currentVersion: {
          select: {
            createdAt: true,
            sourceType: true
          }
        }
      }
    });

    let processedVideoCount = 0;
    let syncedTurnedInRows = 0;

    for (const mediaItem of mediaItems) {
      if (!mediaItem.currentVersion || mediaItem.currentVersion.sourceType !== "VIDEO") {
        continue;
      }

      processedVideoCount += 1;
      syncedTurnedInRows += await syncTurnedInDateForUpload(mediaItem.id, mediaItem.currentVersion.createdAt);
    }

    return ok({
      processedVideoCount,
      syncedTurnedInRows
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
