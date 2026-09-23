import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { IMAGE_BUNNY_LIBRARY_SENTINEL } from "@/src/lib/media-assets";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { createSyntheticImageVideoId } from "@/src/server/media-assets-server";
import { requireProjectRole } from "@/src/server/memberships";

const uploadImageSchema = z.object({
  projectId: z.string().cuid(),
  title: z.string().trim().min(1).max(150).optional(),
  folderId: z.string().cuid().optional()
});

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

export async function POST(request: Request) {
  try {
    const rate = limitByKey(getRequestKey(request, "media:init-image-upload"), {
      max: 20,
      windowMs: 60 * 1000
    });

    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const form = await request.formData();
    const rawFolderId = form.get("folderId");
    const parsed = uploadImageSchema.parse({
      projectId: form.get("projectId"),
      title: form.get("title"),
      folderId: typeof rawFolderId === "string" && rawFolderId.trim().length > 0 ? rawFolderId : undefined
    });

    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0 || !isImageFile(file)) {
      throw new Error("BAD_REQUEST");
    }

    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("PAYLOAD_TOO_LARGE");
    }

    const imageBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const title = parsed.title ?? (file.name.replace(/\.[^/.]+$/, "").trim() || "Untitled image");

    const { userId, project } = await requireProjectRole(parsed.projectId, undefined, { allowVisibility: true });

    if (parsed.folderId) {
      const folder = await prisma.projectFolder.findFirst({
        where: {
          id: parsed.folderId,
          projectId: project.id
        }
      });

      if (!folder) {
        throw new Error("BAD_REQUEST");
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const mediaItem = await tx.mediaItem.create({
        data: {
          projectId: project.id,
          title,
          createdById: userId,
          folderId: parsed.folderId ?? null
        }
      });

      const version = await tx.mediaVersion.create({
        data: {
          mediaItemId: mediaItem.id,
          versionNumber: 1,
          bunnyVideoId: createSyntheticImageVideoId(),
          bunnyLibraryId: IMAGE_BUNNY_LIBRARY_SENTINEL,
          sourceType: "IMAGE",
          imageMimeType: file.type,
          imageBase64,
          status: "READY",
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
          type: "media.image.uploaded",
          payload: {
            fileName: file.name,
            mimeType: file.type
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
          action: "media.image.upload",
          targetType: "MediaVersion",
          targetId: version.id,
          metadata: {
            fileName: file.name,
            mimeType: file.type
          }
        }
      });

      return {
        media: mediaItem,
        version
      };
    });

    return ok(
      {
        media: created.media,
        version: created.version
      },
      201
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
