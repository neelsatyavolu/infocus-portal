import type { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";

type MoveMediaIntoVersionInput = {
  sourceMediaId: string;
  targetMediaId: string;
  actorId: string;
};

type MoveMediaIntoVersionResult = {
  sourceMediaId: string;
  targetMediaId: string;
  movedVersionIds: string[];
  currentVersionId: string;
  assignedMemberIds: string[];
  projectName: string;
};

type MediaWithMoveContext = {
  id: string;
  title: string;
  projectId: string;
  folderId: string | null;
  deletedAt: Date | null;
  currentVersionId: string | null;
  project: {
    id: string;
    name: string;
    workspaceId: string;
  };
  versions: Array<{
    id: string;
    versionNumber: number;
    sourceType: string;
  }>;
  memberAssignments: Array<{
    userId: string;
  }>;
};

function getMediaSourceType(media: MediaWithMoveContext) {
  const sourceTypes = new Set(media.versions.map((version) => version.sourceType));
  if (sourceTypes.size !== 1) {
    throw new Error("BAD_REQUEST");
  }

  return media.versions[0]?.sourceType ?? null;
}

function sortVersionsAscending(media: MediaWithMoveContext) {
  return [...media.versions].sort((a, b) => a.versionNumber - b.versionNumber);
}

export async function moveMediaIntoVersion({
  sourceMediaId,
  targetMediaId,
  actorId
}: MoveMediaIntoVersionInput): Promise<MoveMediaIntoVersionResult> {
  if (sourceMediaId === targetMediaId) {
    throw new Error("BAD_REQUEST");
  }

  return prisma.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.mediaItem.findUnique({
        where: { id: sourceMediaId },
        select: {
          id: true,
          title: true,
          projectId: true,
          folderId: true,
          deletedAt: true,
          currentVersionId: true,
          project: {
            select: {
              id: true,
              name: true,
              workspaceId: true
            }
          },
          versions: {
            select: {
              id: true,
              versionNumber: true,
              sourceType: true
            }
          },
          memberAssignments: {
            select: {
              userId: true
            }
          }
        }
      }),
      tx.mediaItem.findUnique({
        where: { id: targetMediaId },
        select: {
          id: true,
          title: true,
          projectId: true,
          folderId: true,
          deletedAt: true,
          currentVersionId: true,
          project: {
            select: {
              id: true,
              name: true,
              workspaceId: true
            }
          },
          versions: {
            select: {
              id: true,
              versionNumber: true,
              sourceType: true
            }
          },
          memberAssignments: {
            select: {
              userId: true
            }
          }
        }
      })
    ]);

    if (!source || !target) {
      throw new Error("NOT_FOUND");
    }

    if (source.deletedAt || target.deletedAt || source.projectId !== target.projectId) {
      throw new Error("BAD_REQUEST");
    }

    if (source.versions.length === 0 || target.versions.length === 0) {
      throw new Error("BAD_REQUEST");
    }

    const sourceType = getMediaSourceType(source);
    const targetType = getMediaSourceType(target);
    if (!sourceType || sourceType !== targetType) {
      throw new Error("BAD_REQUEST");
    }

    const sourceVersions = sortVersionsAscending(source);
    const latestTargetVersionNumber = Math.max(...target.versions.map((version) => version.versionNumber));
    const movedVersionIds: string[] = [];
    let currentVersionId = target.currentVersionId ?? target.versions[0].id;

    await tx.mediaItem.update({
      where: { id: source.id },
      data: {
        currentVersionId: null
      }
    });

    for (const [index, version] of sourceVersions.entries()) {
      const nextVersionNumber = latestTargetVersionNumber + index + 1;
      await tx.mediaVersion.update({
        where: { id: version.id },
        data: {
          mediaItemId: target.id,
          versionNumber: nextVersionNumber
        }
      });
      movedVersionIds.push(version.id);
      currentVersionId = version.id;
    }

    const assignedMemberIds = [
      ...new Set([
        ...target.memberAssignments.map((assignment) => assignment.userId),
        ...source.memberAssignments.map((assignment) => assignment.userId)
      ])
    ];

    if (source.memberAssignments.length > 0) {
      await tx.mediaItemAssignment.createMany({
        data: source.memberAssignments.map((assignment) => ({
          mediaItemId: target.id,
          userId: assignment.userId
        })),
        skipDuplicates: true
      });
    }

    await tx.mediaItem.update({
      where: { id: target.id },
      data: {
        currentVersionId,
        updatedAt: new Date()
      }
    });

    await tx.mediaItem.update({
      where: { id: source.id },
      data: {
        deletedAt: new Date(),
        deletedById: actorId
      }
    });

    await tx.activityEvent.create({
      data: {
        workspaceId: source.project.workspaceId,
        projectId: source.projectId,
        mediaItemId: target.id,
        actorId,
        type: "media.versions.moved",
        payload: {
          sourceMediaId: source.id,
          sourceTitle: source.title,
          targetMediaId: target.id,
          targetTitle: target.title,
          movedVersionIds
        }
      }
    });

    await tx.auditLog.create({
      data: {
        workspaceId: source.project.workspaceId,
        projectId: source.projectId,
        mediaItemId: target.id,
        actorId,
        action: "media.move_into_version",
        targetType: "MediaItem",
        targetId: target.id,
        metadata: {
          sourceMediaId: source.id,
          sourceTitle: source.title,
          targetMediaId: target.id,
          targetTitle: target.title,
          movedVersionIds
        } satisfies Prisma.InputJsonValue
      }
    });

    return {
      sourceMediaId: source.id,
      targetMediaId: target.id,
      movedVersionIds,
      currentVersionId,
      assignedMemberIds,
      projectName: source.project.name
    };
  });
}
