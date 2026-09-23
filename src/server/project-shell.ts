import { prisma } from "@/src/lib/prisma";
import { descendantFolderMediaCount } from "@/src/lib/project-folders";
import type { ProjectShellData } from "@/src/lib/project-shell";
import { backfillCycleProjectFolders } from "@/src/server/cycle-project-folders";

export async function getProjectShellData(params: {
  projectId: string;
  mediaId?: string | null;
  canViewShareLinks: boolean;
}): Promise<ProjectShellData> {
  const { projectId, mediaId, canViewShareLinks } = params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      workspace: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!project) {
    throw new Error("NOT_FOUND");
  }

  await backfillCycleProjectFolders(project);

  const [folders, assetCount, currentAsset] = await Promise.all([
    prisma.projectFolder.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            mediaItems: {
              where: {
                deletedAt: null
              }
            }
          }
        }
      }
    }),
    prisma.mediaItem.count({
      where: {
        projectId,
        deletedAt: null
      }
    }),
    mediaId
      ? prisma.mediaItem.findFirst({
          where: {
            id: mediaId,
            projectId
          },
          select: {
            id: true,
            title: true,
            folderId: true,
            folder: {
              select: {
                name: true
              }
            }
          }
        })
      : Promise.resolve(null)
  ]);

  const folderCounts = folders.map((folder) => ({
    name: folder.name,
    activeMediaCount: folder._count.mediaItems
  }));

  return {
    projectId: project.id,
    projectName: project.name,
    workspace: project.workspace,
    folders: folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      activeMediaCount: descendantFolderMediaCount(folder.name, folderCounts)
    })),
    assetCount,
    currentAsset: currentAsset
      ? {
          id: currentAsset.id,
          title: currentAsset.title,
          folderId: currentAsset.folderId,
          folderName: currentAsset.folder?.name ?? null
        }
      : null,
    canViewShareLinks
  };
}
