import { z } from "zod";
import { WorkspaceRole } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireWorkspaceMember, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

const createProjectSchema = z.object({
  workspaceId: z.string().cuid(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(400).optional()
});

export async function POST(request: Request) {
  try {
    const payload = createProjectSchema.parse(await request.json());
    const { userId } = await requireWorkspaceMember(payload.workspaceId, [
      WorkspaceRole.OWNER_ADMIN,
      WorkspaceRole.EDITOR
    ]);
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!access.canManageWorkspaces) {
      throw new Error("FORBIDDEN");
    }

    const project = await prisma.project.create({
      data: {
        workspaceId: payload.workspaceId,
        name: payload.name,
        description: payload.description,
        createdById: userId
      }
    });

    const activityLogTask = (async () => {
      try {
        await prisma.activityEvent.create({
          data: {
            workspaceId: payload.workspaceId,
            projectId: project.id,
            actorId: userId,
            type: "project.created",
            payload: {
              name: payload.name
            }
          }
        });
        return null;
      } catch (error) {
        return error;
      }
    })();

    const auditLogTask = (async () => {
      try {
        await prisma.auditLog.create({
          data: {
            workspaceId: payload.workspaceId,
            projectId: project.id,
            actorId: userId,
            action: "project.create",
            targetType: "Project",
            targetId: project.id,
            metadata: {
              name: payload.name
            }
          }
        });
        return null;
      } catch (error) {
        return error;
      }
    })();

    const [activityError, auditError] = await Promise.all([activityLogTask, auditLogTask]);

    if (activityError || auditError) {
      console.error("Project created but logging failed", {
        projectId: project.id,
        workspaceId: payload.workspaceId,
        activityError,
        auditError
      });
    }

    return ok(project, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
