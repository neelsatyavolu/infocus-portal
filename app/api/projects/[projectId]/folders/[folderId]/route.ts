import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { fail, ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { requireProjectRole } from "@/src/server/memberships";

const updateFolderSchema = z.object({
  name: z.string().trim().min(1).max(120)
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; folderId: string }> }
) {
  try {
    const payload = updateFolderSchema.parse(await request.json());
    const { projectId, folderId } = await params;
    const { userId, project } = await requireProjectRole(projectId);

    const existing = await prisma.projectFolder.findFirst({
      where: {
        id: folderId,
        projectId
      }
    });

    if (!existing) {
      throw new Error("NOT_FOUND");
    }

    const folder = await prisma.projectFolder.update({
      where: { id: folderId },
      data: {
        name: payload.name
      }
    });

    await prisma.activityEvent.create({
      data: {
        workspaceId: project.workspaceId,
        projectId,
        actorId: userId,
        type: "folder.renamed",
        payload: {
          folderId,
          name: folder.name
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: project.workspaceId,
        projectId,
        actorId: userId,
        action: "folder.rename",
        targetType: "ProjectFolder",
        targetId: folderId,
        metadata: {
          name: folder.name
        }
      }
    });

    return ok(folder);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; folderId: string }> }
) {
  try {
    const { projectId, folderId } = await params;
    const { userId, project } = await requireProjectRole(projectId);

    const folder = await prisma.projectFolder.findFirst({
      where: {
        id: folderId,
        projectId
      }
    });

    if (!folder) {
      throw new Error("NOT_FOUND");
    }

    const folderItemCount = await prisma.mediaItem.count({
      where: {
        folderId
      }
    });

    if (folderItemCount > 0) {
      return fail("Folder is not empty", 409);
    }

    await prisma.projectFolder.delete({
      where: {
        id: folderId
      }
    });

    await prisma.activityEvent.create({
      data: {
        workspaceId: project.workspaceId,
        projectId,
        actorId: userId,
        type: "folder.deleted",
        payload: {
          folderId,
          name: folder.name
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: project.workspaceId,
        projectId,
        actorId: userId,
        action: "folder.delete",
        targetType: "ProjectFolder",
        targetId: folderId,
        metadata: {
          name: folder.name
        }
      }
    });

    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
