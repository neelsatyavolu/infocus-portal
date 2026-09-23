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
import { requireMediaAccess } from "@/src/server/memberships";

const versionUploadSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  fileName: z.string().trim().min(1).max(255).optional()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const rate = limitByKey(getRequestKey(request, "media:version-upload"), {
      max: 20,
      windowMs: 60 * 1000
    });

    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const { mediaId } = await params;
    const payload = versionUploadSchema.parse(await request.json());
    const { userId, media } = await requireMediaAccess(mediaId, undefined, { allowVisibility: true });

    const latest = await prisma.mediaVersion.findFirst({
      where: { mediaItemId: media.id },
      orderBy: { versionNumber: "desc" }
    });

    const nextVersion = (latest?.versionNumber ?? 0) + 1;
    const title = payload.title ?? `${media.title} v${nextVersion}`;
    const useNas = isNasStorageEnabled();

    let upload: Record<string, unknown>;
    let bunnyVideoId: string;
    let bunnyLibraryId: string;
    let nasPath: string | null = null;
    let storageProvider = "BUNNY";

    if (useNas) {
      const path = buildNasMediaPath({
        projectName: media.project.name,
        folderName: media.folder?.name ?? null,
        mediaTitle: media.title,
        versionNumber: nextVersion,
        fileName: payload.fileName || "video.mp4"
      });
      const session = await nasMintUploadSession(path);
      bunnyVideoId = session.videoId;
      bunnyLibraryId = "nas";
      nasPath = session.path;
      storageProvider = "NAS";
      upload = {
        provider: "NAS",
        uploadUrl: session.uploadUrl,
        path: session.path,
        token: session.token,
        expiresAt: session.expiresAt,
        videoId: session.videoId,
        libraryId: "nas",
        signature: session.signature
      };
    } else {
      const bunnyVideo = await createBunnyVideo(title);
      const bunnyUpload = createUploadAuthorization(bunnyVideo.videoId);
      bunnyVideoId = bunnyVideo.videoId;
      bunnyLibraryId = bunnyVideo.libraryId;
      upload = { provider: "BUNNY", ...bunnyUpload };
    }

    const version = await prisma.mediaVersion.create({
      data: {
        mediaItemId: media.id,
        versionNumber: nextVersion,
        bunnyVideoId,
        bunnyLibraryId,
        storageProvider,
        nasPath,
        uploadSignature: String(upload.signature || ""),
        status: "UPLOADING",
        createdById: userId
      }
    });

    await prisma.mediaItem.update({
      where: { id: media.id },
      data: {
        currentVersionId: version.id,
        title: payload.title ?? media.title
      }
    });

    await prisma.activityEvent.create({
      data: {
        workspaceId: media.project.workspaceId,
        projectId: media.project.id,
        mediaItemId: media.id,
        mediaVersionId: version.id,
        actorId: userId,
        type: "media.version.upload.initialized",
        payload: {
          fileName: payload.fileName,
          version: nextVersion,
          storageProvider
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: media.project.workspaceId,
        projectId: media.project.id,
        mediaItemId: media.id,
        mediaVersionId: version.id,
        actorId: userId,
        action: "media.version.upload.initialize",
        targetType: "MediaVersion",
        targetId: version.id,
        metadata: {
          fileName: payload.fileName,
          version: nextVersion,
          storageProvider
        }
      }
    });

    return ok(
      {
        mediaId: media.id,
        version,
        upload
      },
      201
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
