import { getBunnyVideo } from "@/src/lib/bunny";
import { isNasVideoId } from "@/src/lib/nas-storage";
import { prisma } from "@/src/lib/prisma";

export const STORAGE_CACHE_TTL_MS = 5 * 60 * 1000;

type ProjectStorageSnapshot = {
  totalBytes: number;
  isEstimated: boolean;
  updatedAt: string | null;
  stale: boolean;
};

function estimateVersionStorageBytes(durationSeconds: number | null, width: number | null) {
  const duration = durationSeconds ?? 0;
  if (duration <= 0) {
    return 0;
  }

  const videoWidth = width ?? 0;
  const bitrateMbps = videoWidth >= 1920 ? 8 : videoWidth >= 1280 ? 5 : 3;
  return duration * bitrateMbps * 125_000;
}

function toBytesBigInt(value: number) {
  return BigInt(Math.max(0, Math.round(value)));
}

function toBytesNumber(value: bigint | null | undefined) {
  if (typeof value !== "bigint") {
    return 0;
  }

  return Number(value);
}

function hasPositiveBytes(value: bigint | null | undefined): value is bigint {
  return typeof value === "bigint" && value > 0n;
}

export function isStorageCacheStale(updatedAt: Date | null | undefined, ttlMs = STORAGE_CACHE_TTL_MS) {
  if (!updatedAt) {
    return true;
  }

  return Date.now() - updatedAt.getTime() > ttlMs;
}

export function shouldQueryBunnyStorage(version: {
  storageProvider?: string | null;
  bunnyVideoId: string | null | undefined;
}) {
  if ((version.storageProvider ?? "").toUpperCase() === "NAS") {
    return false;
  }

  return !isNasVideoId(version.bunnyVideoId);
}

export async function refreshProjectStorageCache(projectId: string, ttlMs = STORAGE_CACHE_TTL_MS) {
  const now = new Date();
  const versions = await prisma.mediaVersion.findMany({
    where: {
      mediaItem: {
        projectId,
        deletedAt: null
      }
    },
    select: {
      id: true,
      bunnyVideoId: true,
      storageProvider: true,
      durationSeconds: true,
      width: true,
      storageSizeBytes: true,
      storageSyncedAt: true
    }
  });

  let usedEstimate = false;
  const finalSizeByVersion = new Map<string, bigint>();

  for (const version of versions) {
    const estimatedBytes = toBytesBigInt(estimateVersionStorageBytes(version.durationSeconds, version.width));
    const currentSize = hasPositiveBytes(version.storageSizeBytes) ? version.storageSizeBytes : estimatedBytes;
    finalSizeByVersion.set(version.id, currentSize);

    if (!hasPositiveBytes(version.storageSizeBytes)) {
      usedEstimate = true;
    }
  }

  for (const version of versions) {
    if (!isStorageCacheStale(version.storageSyncedAt, ttlMs)) {
      continue;
    }

    if (!shouldQueryBunnyStorage(version)) {
      const fallback = toBytesBigInt(estimateVersionStorageBytes(version.durationSeconds, version.width));
      const size = hasPositiveBytes(version.storageSizeBytes) ? version.storageSizeBytes : fallback;
      if (!hasPositiveBytes(version.storageSizeBytes)) {
        usedEstimate = true;
      }
      finalSizeByVersion.set(version.id, size);
      await prisma.mediaVersion.update({
        where: { id: version.id },
        data: {
          storageSizeBytes: size > 0n ? size : null,
          storageSyncedAt: now
        }
      });
      continue;
    }

    try {
      const bunnyVideo = await getBunnyVideo(version.bunnyVideoId);
      const exactBytes = bunnyVideo?.storageSizeBytes ?? null;

      if (typeof exactBytes === "number" && exactBytes > 0) {
        const size = toBytesBigInt(exactBytes);
        finalSizeByVersion.set(version.id, size);
        await prisma.mediaVersion.update({
          where: { id: version.id },
          data: {
            storageSizeBytes: size,
            storageSyncedAt: now
          }
        });
        continue;
      }
    } catch {
      // keep current cached value and fallback estimate
    }

    const fallback = toBytesBigInt(estimateVersionStorageBytes(version.durationSeconds, version.width));
    usedEstimate = true;
    finalSizeByVersion.set(version.id, fallback);
    await prisma.mediaVersion.update({
      where: { id: version.id },
      data: {
        storageSizeBytes: fallback > 0n ? fallback : null,
        storageSyncedAt: now
      }
    });
  }

  let totalBytes = 0n;
  for (const bytes of finalSizeByVersion.values()) {
    totalBytes += bytes;
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      storageBytes: totalBytes,
      storageUpdatedAt: now
    }
  });

  return {
    totalBytes: Number(totalBytes),
    isEstimated: usedEstimate,
    updatedAt: now.toISOString()
  };
}

export async function getProjectStorageSnapshot(projectId: string, ttlMs = STORAGE_CACHE_TTL_MS): Promise<ProjectStorageSnapshot> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      storageBytes: true,
      storageUpdatedAt: true
    }
  });

  if (!project) {
    throw new Error("NOT_FOUND");
  }

  const stale = isStorageCacheStale(project.storageUpdatedAt, ttlMs);
  const initialBytes = toBytesNumber(project.storageBytes);

  if (initialBytes === 0) {
    const activeVersionCount = await prisma.mediaVersion.count({
      where: {
        mediaItem: {
          projectId,
          deletedAt: null
        }
      }
    });

    if (activeVersionCount > 0) {
      const refreshed = await refreshProjectStorageCache(projectId, ttlMs);
      return {
        totalBytes: refreshed.totalBytes,
        isEstimated: refreshed.isEstimated,
        updatedAt: refreshed.updatedAt,
        stale: false
      };
    }
  }

  if (!project.storageUpdatedAt && initialBytes === 0) {
    const refreshed = await refreshProjectStorageCache(projectId, ttlMs);
    return {
      totalBytes: refreshed.totalBytes,
      isEstimated: refreshed.isEstimated,
      updatedAt: refreshed.updatedAt,
      stale: false
    };
  }

  if (stale) {
    void refreshProjectStorageCache(projectId, ttlMs).catch(() => undefined);
  }

  return {
    totalBytes: initialBytes,
    isEstimated: false,
    updatedAt: project.storageUpdatedAt?.toISOString() ?? null,
    stale
  };
}
