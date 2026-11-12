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

const COMPLETABLE_STATUSES = new Set<MediaStatus>([MediaStatus.UPLOADING, MediaStatus.PROCESSING, MediaStatus.READY]);

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
    include: {
      mediaItem: {
        select: { projectId: true, createdById: true, deletedAt: true, project: { select: { name: true } } }
      }
    }
  });
  if (!version || version.mediaItem.deletedAt) {
    throw new Error("NOT_FOUND");
  }
  const ownerId = version.createdById ?? version.mediaItem.createdById;
  if (ownerId && ownerId !== input.userId) {
    throw new Error("FORBIDDEN");
  }
  // Only uploads started by initCustomQueueUpload land here; any other media must go through its own flow.
  if (version.mediaItem.project.name !== CUSTOM_QUEUE_PROJECT_NAME) {
    throw new Error("FORBIDDEN");
  }
  // READY covers a retried complete; a failed upload can't be queued.
  if (!COMPLETABLE_STATUSES.has(version.status)) {
    throw new Error("CONFLICT");
  }

  const existing = await prisma.packageProgressRow.findFirst({
    where: { finalCutMediaItemId: input.mediaId }
  });
  if (existing && !isCustomQueuePackage(existing)) {
    throw new Error("CONFLICT");
  }

  const rowId = await prisma.$transaction(async (tx) => {
    await tx.mediaVersion.update({
      where: { id: version.id },
      data: { status: MediaStatus.READY, storageSyncedAt: new Date() }
    });
    await tx.mediaItem.update({
      where: { id: input.mediaId },
      data: { currentVersionId: version.id, title }
    });

    if (existing) {
      if (existing.groupTopic !== title) {
        await tx.packageProgressRow.update({
          where: { id: existing.id },
          data: { groupTopic: title }
        });
      }
      return existing.id;
    }

    const last = await tx.packageProgressRow.aggregate({
      where: { cycleNumber: CUSTOM_QUEUE_CYCLE_NUMBER },
      _max: { rowOrder: true }
    });
    const row = await tx.packageProgressRow.create({
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
    return row.id;
  });

  // After the commit: queueing reads the now-READY current version.
  return setQueuedForAir(rowId, true);
}
