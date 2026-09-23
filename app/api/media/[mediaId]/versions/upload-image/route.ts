import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { IMAGE_BUNNY_LIBRARY_SENTINEL } from "@/src/lib/media-assets";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { createSyntheticImageVideoId } from "@/src/server/media-assets-server";
import { requireMediaAccess } from "@/src/server/memberships";

const uploadImageVersionSchema = z.object({
  title: z.string().trim().min(1).max(150).optional()
});

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const rate = limitByKey(getRequestKey(request, "media:image-version-upload"), {
      max: 20,
      windowMs: 60 * 1000
    });

    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const { mediaId } = await params;
    const form = await request.formData();
    const payload = uploadImageVersionSchema.parse({
      title: form.get("title")
    });

    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0 || !isImageFile(file)) {
      throw new Error("BAD_REQUEST");
    }

    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("PAYLOAD_TOO_LARGE");
    }

    const { userId, media } = await requireMediaAccess(mediaId, undefined, { allowVisibility: true });

    const latest = await prisma.mediaVersion.findFirst({
      where: {
        mediaItemId: media.id
      },
      orderBy: {
        versionNumber: "desc"
      },
      select: {
        versionNumber: true,
        bunnyLibraryId: true
      }
    });

    if (latest?.bunnyLibraryId && latest.bunnyLibraryId !== IMAGE_BUNNY_LIBRARY_SENTINEL) {
      throw new Error("BAD_REQUEST");
    }

    const imageBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const nextVersionNumber = (latest?.versionNumber ?? 0) + 1;

    const version = await prisma.mediaVersion.create({
      data: {
        mediaItemId: media.id,
        versionNumber: nextVersionNumber,
        bunnyVideoId: createSyntheticImageVideoId(),
        bunnyLibraryId: IMAGE_BUNNY_LIBRARY_SENTINEL,
        sourceType: "IMAGE",
        imageMimeType: file.type,
        imageBase64,
        status: "READY",
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
        type: "media.image.version.uploaded",
        payload: {
          fileName: file.name,
          version: nextVersionNumber
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
        action: "media.image.version.upload",
        targetType: "MediaVersion",
        targetId: version.id,
        metadata: {
          fileName: file.name,
          version: nextVersionNumber
        }
      }
    });

    return ok(
      {
        mediaId: media.id,
        version
      },
      201
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
