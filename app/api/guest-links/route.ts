import { z } from "zod";
import { WorkspaceRole } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";
import { generateGuestToken, hashPasscode } from "@/src/lib/guest-links";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";

const createGuestLinkSchema = z
  .object({
    projectId: z.string().cuid().optional(),
    mediaVersionId: z.string().cuid().optional(),
    permission: z.enum(["VIEW", "COMMENT"]).default("COMMENT"),
    passcode: z.string().min(4).max(40).optional(),
    expiresAt: z.string().datetime().optional()
  })
  .superRefine((value, ctx) => {
    if (!value.projectId && !value.mediaVersionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projectId or mediaVersionId is required"
      });
    }

    if (value.projectId && value.mediaVersionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either projectId or mediaVersionId, not both"
      });
    }
  });

export async function POST(request: Request) {
  try {
    const rate = limitByKey(getRequestKey(request, "guest-links:create"), {
      max: 30,
      windowMs: 60 * 1000
    });

    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const userId = await requireUserId();
    await syncUserProfile(userId);

    const payload = createGuestLinkSchema.parse(await request.json());

    let workspaceId: string;
    let projectId: string | undefined = payload.projectId;

    if (payload.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: payload.projectId },
        select: { id: true, workspaceId: true }
      });

      if (!project) {
        throw new Error("NOT_FOUND");
      }

      workspaceId = project.workspaceId;
    } else {
      const mediaVersion = await prisma.mediaVersion.findUnique({
        where: { id: payload.mediaVersionId },
        include: {
          mediaItem: {
            include: {
              project: true
            }
          }
        }
      });

      if (!mediaVersion) {
        throw new Error("NOT_FOUND");
      }

      workspaceId = mediaVersion.mediaItem.project.workspaceId;
      projectId = mediaVersion.mediaItem.project.id;
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId
        }
      }
    });

    if (!membership || membership.role !== WorkspaceRole.OWNER_ADMIN) {
      throw new Error("FORBIDDEN");
    }

    const link = await prisma.guestLink.create({
      data: {
        token: generateGuestToken(),
        projectId: payload.projectId,
        mediaVersionId: payload.mediaVersionId,
        permission: payload.permission,
        passcodeHash: payload.passcode ? hashPasscode(payload.passcode) : null,
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
        createdById: userId
      }
    });

    await prisma.activityEvent.create({
      data: {
        workspaceId,
        projectId,
        mediaVersionId: payload.mediaVersionId,
        guestLinkId: link.id,
        actorId: userId,
        type: "guest_link.created",
        payload: {
          permission: link.permission,
          expiresAt: link.expiresAt
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        projectId,
        mediaVersionId: payload.mediaVersionId,
        guestLinkId: link.id,
        actorId: userId,
        action: "guest_link.create",
        targetType: "GuestLink",
        targetId: link.id,
        metadata: {
          permission: link.permission,
          expiresAt: link.expiresAt
        }
      }
    });

    return ok(link, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
