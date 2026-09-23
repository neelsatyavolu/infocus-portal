import { MediaStatus, Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";

export const PROJECT_MEDIA_PAGE_SIZE = 40;

export type ProjectMediaFilter = "all" | "ready" | "in-progress" | "failed";
export type ProjectMediaSort = "recent" | "name" | "status";
export type ProjectMediaScope = "active" | "deleted";

export type ProjectMediaQuery = {
  projectId: string;
  filter: ProjectMediaFilter;
  sort: ProjectMediaSort;
  scope: ProjectMediaScope;
  folderId: string;
  page: number;
  pageSize?: number;
};

export function normalizeProjectMediaPage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function buildProjectMediaWhere(query: ProjectMediaQuery): Prisma.MediaItemWhereInput {
  const where: Prisma.MediaItemWhereInput = {
    projectId: query.projectId
  };

  if (query.scope === "deleted") {
    where.deletedAt = {
      not: null
    };
  } else {
    where.deletedAt = null;
  }

  if (query.scope === "active" && query.folderId === "all") {
    where.folderId = null;
  } else if (query.folderId !== "all") {
    where.folderId = query.folderId === "root" ? null : query.folderId;
  }

  if (query.scope === "deleted") {
    return where;
  }

  if (query.filter === "ready") {
    where.currentVersion = {
      is: {
        status: MediaStatus.READY
      }
    };
    return where;
  }

  if (query.filter === "failed") {
    where.currentVersion = {
      is: {
        status: MediaStatus.FAILED
      }
    };
    return where;
  }

  if (query.filter === "in-progress") {
    where.OR = [
      {
        currentVersionId: null
      },
      {
        currentVersion: {
          is: {
            status: {
              in: [MediaStatus.UPLOADING, MediaStatus.PROCESSING]
            }
          }
        }
      }
    ];
  }

  return where;
}

function buildProjectMediaOrderBy(query: ProjectMediaQuery): Prisma.MediaItemOrderByWithRelationInput[] {
  if (query.sort === "name") {
    return [{ title: "asc" }, { updatedAt: "desc" }];
  }

  if (query.sort === "status") {
    return [
      {
        currentVersion: {
          status: "asc"
        }
      },
      { updatedAt: "desc" }
    ];
  }

  if (query.scope === "deleted") {
    return [{ deletedAt: "desc" }, { updatedAt: "desc" }];
  }

  return [{ updatedAt: "desc" }];
}

export async function getProjectMediaPage(query: ProjectMediaQuery) {
  const pageSize = Math.min(Math.max(query.pageSize ?? PROJECT_MEDIA_PAGE_SIZE, 1), 100);
  const page = Math.max(1, query.page);
  const where = buildProjectMediaWhere(query);
  const orderBy = buildProjectMediaOrderBy(query);

  const [totalCount, items] = await Promise.all([
    prisma.mediaItem.count({ where }),
    prisma.mediaItem.findMany({
      where,
      include: {
        folder: true,
        memberAssignments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                nickname: true,
                email: true
              }
            }
          },
          orderBy: {
            createdAt: "asc"
          }
        },
        deletedBy: {
          select: {
            name: true,
            nickname: true,
            email: true
          }
        },
        currentVersion: true,
        versions: {
          orderBy: { versionNumber: "desc" },
          include: {
            createdBy: {
              select: {
                name: true,
                nickname: true,
                email: true
              }
            },
            _count: {
              select: {
                comments: true
              }
            }
          }
        }
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    items,
    totalCount,
    page,
    pageSize,
    totalPages
  };
}

export async function projectHasPendingMediaVersions(projectId: string) {
  const pending = await prisma.mediaVersion.findFirst({
    where: {
      mediaItem: {
        projectId
      },
      status: {
        in: [MediaStatus.UPLOADING, MediaStatus.PROCESSING]
      }
    },
    select: {
      id: true
    }
  });

  return Boolean(pending);
}
