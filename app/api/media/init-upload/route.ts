import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { createBunnyVideo, createUploadAuthorization } from "@/src/lib/bunny";
import { ok } from "@/src/lib/http";
import {
  buildNasMediaPath,
  isNasStorageEnabled,
  nasMintUploadSession
} from "@/src/lib/nas-storage";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { requireProjectRole } from "@/src/server/memberships";

const initUploadSchema = z.object({
  projectId: z.string().cuid(),
  title: z.string().trim().min(1).max(150),
  fileName: z.string().trim().min(1).max(255).optional(),
  folderId: z.string().cuid().nullable().optional()
});

export async function POST(request: Request) {
  try {
    const rate = limitByKey(getRequestKey(request, "media:init-upload"), {
      max: 12,
      windowMs: 60 * 1000
    });

    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = initUploadSchema.parse(await request.json());

    const { userId, project } = await requireProjectRole(payload.projectId, undefined, {
      allowVisibility: true
    });

    let folderName: string | null = null;
    if (payload.folderId) {
      const folder = await prisma.projectFolder.findFirst({
        where: {
          id: payload.folderId,
          projectId: project.id
        }
      });

      if (!folder) {
        throw new Error("BAD_REQUEST");
      }
      folderName = folder.name;
    }

    const useNas = isNasStorageEnabled();

    // NAS path needs version number 1 for new media
    let nasSession: Awaited<ReturnType<typeof nasMintUploadSession>> | null = null;
    let bunnyVideo: { videoId: string; libraryId: string } | null = null;
    let bunnyUpload: ReturnType<typeof createUploadAuthorization> | null = null;

    if (useNas) {
      const nasPath = buildNasMediaPath({
        projectName: project.name,
        folderName,
        mediaTitle: payload.title,
        versionNumber: 1,
        fileName: payload.fileName || "video.mp4"
      });
      nasSession = await nasMintUploadSession(nasPath);
    } else {
      bunnyVideo = await createBunnyVideo(payload.title);
      bunnyUpload = createUploadAuthorization(bunnyVideo.videoId);
    }

    const created = await prisma.$transaction(async (tx) => {
      const mediaItem = await tx.mediaItem.create({
        data: {
          projectId: project.id,
          title: payload.title,
          createdById: userId,
          folderId: payload.folderId ?? null
        }
      });

      const version = await tx.mediaVersion.create({
        data: {
          mediaItemId: mediaItem.id,
          versionNumber: 1,
          bunnyVideoId: useNas ? nasSession!.videoId : bunnyVideo!.videoId,
          bunnyLibraryId: useNas ? "nas" : bunnyVideo!.libraryId,
          storageProvider: useNas ? "NAS" : "BUNNY",
          nasPath: useNas ? nasSession!.path : null,
          uploadSignature: useNas ? nasSession!.signature : bunnyUpload!.signature,
          status: "UPLOADING",
          createdById: userId
        }
      });

      await tx.mediaItem.update({
        where: { id: mediaItem.id },
        data: {
          currentVersionId: version.id
        }
      });

      await tx.activityEvent.create({
        data: {
          workspaceId: project.workspaceId,
          projectId: project.id,
          mediaItemId: mediaItem.id,
          mediaVersionId: version.id,
          actorId: userId,
          type: "media.upload.initialized",
          payload: {
            fileName: payload.fileName,
            title: payload.title,
            version: 1,
            storageProvider: useNas ? "NAS" : "BUNNY",
            nasPath: useNas ? nasSession!.path : undefined
          }
        }
      });

      await tx.auditLog.create({
        data: {
          workspaceId: project.workspaceId,
          projectId: project.id,
          mediaItemId: mediaItem.id,
          mediaVersionId: version.id,
          actorId: userId,
          action: "media.upload.initialize",
          targetType: "MediaVersion",
          targetId: version.id,
          metadata: {
            fileName: payload.fileName,
            title: payload.title,
            storageProvider: useNas ? "NAS" : "BUNNY"
          }
        }
      });

      return {
        mediaItem,
        version
      };
    });

    if (useNas && nasSession) {
      return ok(
        {
          media: created.mediaItem,
          version: created.version,
          upload: {
            provider: "NAS" as const,
            uploadUrl: nasSession.uploadUrl,
            path: nasSession.path,
            token: nasSession.token,
            expiresAt: nasSession.expiresAt,
            // Compatibility fields for older clients
            videoId: nasSession.videoId,
            libraryId: "nas",
            signature: nasSession.signature
          }
        },
        201
      );
    }

    return ok(
      {
        media: created.mediaItem,
        version: created.version,
        upload: {
          provider: "BUNNY" as const,
          ...bunnyUpload!
        }
      },
      201
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
