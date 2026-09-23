import { prisma } from "@/src/lib/prisma";
import {
  cycleFolderAncestorPaths,
  cycleFolderPath,
  parseCycleNasFolderPath,
  parseCycleProjectNumber
} from "@/src/lib/project-folders";

export async function ensureProjectFolderPath(input: {
  projectId: string;
  path: string;
  createdById?: string | null;
}): Promise<{ id: string; name: string }> {
  const ancestors = cycleFolderAncestorPaths(input.path);
  let leaf: { id: string; name: string } | null = null;

  for (const name of ancestors) {
    leaf = await prisma.projectFolder.upsert({
      where: {
        projectId_name: {
          projectId: input.projectId,
          name
        }
      },
      create: {
        projectId: input.projectId,
        name,
        createdById: input.createdById ?? null
      },
      update: {},
      select: {
        id: true,
        name: true
      }
    });
  }

  if (!leaf) {
    throw new Error("NOT_FOUND");
  }

  return leaf;
}

export async function ensureCycleMediaFolder(input: {
  projectId: string;
  groupName: string;
  stageFolder: string;
  createdById?: string | null;
}): Promise<{ id: string; name: string }> {
  return ensureProjectFolderPath({
    projectId: input.projectId,
    path: cycleFolderPath(input.groupName, input.stageFolder),
    createdById: input.createdById
  });
}

export async function backfillCycleProjectFolders(project: { id: string; name: string }) {
  const cycleNumber = parseCycleProjectNumber(project.name);
  if (!cycleNumber) {
    return { assigned: 0 };
  }

  const items = await prisma.mediaItem.findMany({
    where: {
      projectId: project.id,
      folderId: null,
      deletedAt: null
    },
    select: {
      id: true,
      createdById: true,
      currentVersion: {
        select: {
          nasPath: true
        }
      }
    }
  });

  const mediaIdsByPath = new Map<string, string[]>();
  const createdByByPath = new Map<string, string | null>();

  for (const item of items) {
    const path = item.currentVersion?.nasPath
      ? parseCycleNasFolderPath(item.currentVersion.nasPath, cycleNumber)
      : null;
    if (!path) {
      continue;
    }
    const existing = mediaIdsByPath.get(path) ?? [];
    existing.push(item.id);
    mediaIdsByPath.set(path, existing);
    if (!createdByByPath.has(path)) {
      createdByByPath.set(path, item.createdById);
    }
  }

  if (mediaIdsByPath.size === 0) {
    return { assigned: 0 };
  }

  let assigned = 0;
  for (const [path, mediaIds] of mediaIdsByPath) {
    const folder = await ensureProjectFolderPath({
      projectId: project.id,
      path,
      createdById: createdByByPath.get(path)
    });
    const result = await prisma.mediaItem.updateMany({
      where: {
        id: { in: mediaIds },
        folderId: null
      },
      data: {
        folderId: folder.id
      }
    });
    assigned += result.count;
  }

  return { assigned };
}
