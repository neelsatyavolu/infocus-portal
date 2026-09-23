import { isStorageCacheStale, STORAGE_CACHE_TTL_MS } from "@/src/server/storage-cache";

export type ProjectStorageRow = {
  id: string;
  storageBytes: bigint | number | null;
  storageUpdatedAt: Date | null;
  mediaItemCount: number;
};

export function sumCachedStorageBytes(projects: Array<{ storageBytes: bigint | number | null }>) {
  return projects.reduce((total, project) => total + Number(project.storageBytes ?? 0), 0);
}

export function isCachedStorageEstimated(projects: Array<{ storageUpdatedAt: Date | null }>) {
  return projects.some((project) => !project.storageUpdatedAt);
}

export function selectBackgroundStorageRefreshIds(
  projects: ProjectStorageRow[],
  options?: { limit?: number; ttlMs?: number }
) {
  const limit = options?.limit ?? 10;
  const ttlMs = options?.ttlMs ?? STORAGE_CACHE_TTL_MS;
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const project of projects) {
    if (ids.length >= limit) {
      break;
    }

    const bytes = Number(project.storageBytes ?? 0);
    const needsRefresh =
      !project.storageUpdatedAt ||
      (bytes === 0 && project.mediaItemCount > 0) ||
      isStorageCacheStale(project.storageUpdatedAt, ttlMs);

    if (!needsRefresh || seen.has(project.id)) {
      continue;
    }

    seen.add(project.id);
    ids.push(project.id);
  }

  return ids;
}
