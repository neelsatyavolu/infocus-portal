import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { requireProjectRole } from "@/src/server/memberships";

const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(120)
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await requireProjectRole(projectId);

    const [folders, activeMediaCounts] = await Promise.all([
      prisma.projectFolder.findMany({
        where: {
          projectId
        },
        orderBy: {
          createdAt: "asc"
        }
      }),
      prisma.mediaItem.groupBy({
        by: ["folderId"],
        where: {
          projectId,
          deletedAt: null,
          folderId: {
            not: null
          }
        },
        _count: {
          _all: true
        }
      })
    ]);

    const countsByFolderId = new Map(
      activeMediaCounts
        .filter((entry) => entry.folderId)
        .map((entry) => [entry.folderId as string, entry._count._all])
    );

    return ok(
      folders.map((folder) => ({
        ...folder,
        activeMediaCount: countsByFolderId.get(folder.id) ?? 0
      }))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const payload = createFolderSchema.parse(await request.json());
    const { projectId } = await params;
    const { userId, project } = await requireProjectRole(projectId);

    const folder = await prisma.projectFolder.create({
      data: {
        projectId,
        name: payload.name,
        createdById: userId
      }
    });

    await prisma.activityEvent.create({
      data: {
        workspaceId: project.workspaceId,
        projectId,
        actorId: userId,
        type: "folder.created",
        payload: {
          folderId: folder.id,
          name: folder.name
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: project.workspaceId,
        projectId,
        actorId: userId,
        action: "folder.create",
        targetType: "ProjectFolder",
        targetId: folder.id,
        metadata: {
          name: folder.name
        }
      }
    });

    return ok(folder, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
