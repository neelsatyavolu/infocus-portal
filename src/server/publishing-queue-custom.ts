import { MediaStatus } from "@prisma/client";
import {
  buildPublishingQueueNasPath,
  isNasStorageEnabled,
  nasMintUploadSession
} from "@/src/lib/nas-storage";
import {
  CUSTOM_QUEUE_CYCLE_NUMBER,
  CUSTOM_QUEUE_GROUP_TYPE,
  CUSTOM_QUEUE_PROJECT_NAME,
  isCustomQueuePackage
} from "@/src/lib/publishing-queue";
import { sanitizeSegment } from "@/src/lib/project-folders";
import { prisma } from "@/src/lib/prisma";
import { ensureProjectFolderPath } from "@/src/server/cycle-project-folders";
import { setQueuedForAir } from "@/src/server/publishing-queue";

async function ensurePublishingQueueProject() {
  const existing = await prisma.project.findFirst({ where: { name: CUSTOM_QUEUE_PROJECT_NAME } });
  if (existing) return existing;

  const workspace = await prisma.workspace.findFirst({ orderBy: { createdAt: "asc" } });
  if (!workspace) {
    throw new Error("NOT_FOUND");
  }

  return prisma.project.create({
    data: {
      workspaceId: workspace.id,
      name: CUSTOM_QUEUE_PROJECT_NAME,
      description: "System project for custom publishing-queue uploads"
    }
  });
}

export async function initCustomQueueUpload(input: {
  userId: string;
  title: string;
  fileName: string;
}) {
  if (!isNasStorageEnabled()) {
    throw new Error("Drive uploads are required to add a custom package.");
  }

  const title = input.title.trim();
  if (!title) {
    throw new Error("BAD_REQUEST");
  }

  const project = await ensurePublishingQueueProject();
  const folder = await ensureProjectFolderPath({
    projectId: project.id,
    path: sanitizeSegment(title, "Untitled"),
    createdById: input.userId
  });
  const nasPath = buildPublishingQueueNasPath({
    title,
    fileName: input.fileName,
    versionNumber: 1
  });
  const nasSession = await nasMintUploadSession(nasPath);

  const created = await prisma.$transaction(async (tx) => {
    const mediaItem = await tx.mediaItem.create({
      data: {
        projectId: project.id,
        title,
        folderId: folder.id,
        createdById: input.userId
      }
    });
    const version = await tx.mediaVersion.create({
      data: {
        mediaItemId: mediaItem.id,
        versionNumber: 1,
        bunnyVideoId: nasSession.videoId,
        bunnyLibraryId: "nas",
        storageProvider: "NAS",
        nasPath: nasSession.path,
        uploadSignature: nasSession.signature,
        status: "UPLOADING",
        createdById: input.userId
      }
    });
    await tx.mediaItem.update({
      where: { id: mediaItem.id },
      data: { currentVersionId: version.id }
    });
    return { mediaItem, version };
  });

  return {
    mediaId: created.mediaItem.id,
    versionId: created.version.id,
    upload: nasSession
  };
}

export async function completeCustomQueueUpload(input: {
  userId: string;
  title: string;
  mediaId: string;
  versionId: string;
}) {
  const title = input.title.trim();
  if (!title) {
    throw new Error("BAD_REQUEST");
  }

  const version = await prisma.mediaVersion.findFirst({
    where: { id: input.versionId, mediaItemId: input.mediaId, storageProvider: "NAS" },
    include: { mediaItem: { select: { projectId: true, createdById: true } } }
  });
  if (!version) {
    throw new Error("NOT_FOUND");
  }
  const ownerId = version.createdById ?? version.mediaItem.createdById;
  if (ownerId && ownerId !== input.userId) {
    throw new Error("FORBIDDEN");
  }

  await prisma.mediaVersion.update({
    where: { id: version.id },
    data: { status: MediaStatus.READY, storageSyncedAt: new Date() }
  });
  await prisma.mediaItem.update({
    where: { id: input.mediaId },
    data: { currentVersionId: version.id, title }
  });

  const existing = await prisma.packageProgressRow.findFirst({
    where: { finalCutMediaItemId: input.mediaId }
  });
  if (existing) {
    if (!isCustomQueuePackage(existing)) {
      throw new Error("CONFLICT");
    }
    if (existing.groupTopic !== title) {
      await prisma.packageProgressRow.update({
        where: { id: existing.id },
        data: { groupTopic: title }
      });
    }
    return setQueuedForAir(existing.id, true);
  }

  const last = await prisma.packageProgressRow.aggregate({
    where: { cycleNumber: CUSTOM_QUEUE_CYCLE_NUMBER },
    _max: { rowOrder: true }
  });

  const row = await prisma.packageProgressRow.create({
    data: {
      cycleNumber: CUSTOM_QUEUE_CYCLE_NUMBER,
      rowOrder: (last._max.rowOrder ?? 0) + 1,
      groupTopic: title,
      groupType: CUSTOM_QUEUE_GROUP_TYPE,
      projectId: version.mediaItem.projectId,
      finalCut: true,
      finalCutMediaItemId: input.mediaId
    }
  });

  return setQueuedForAir(row.id, true);
}
