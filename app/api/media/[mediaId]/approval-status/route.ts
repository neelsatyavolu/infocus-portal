import { z } from "zod";
import { ApprovalStatus, WorkspaceRole } from "@prisma/client";
import { isApprovalTransitionAllowed } from "@/src/lib/approval";
import { handleRouteError } from "@/src/lib/api-errors";
import { syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { requireMediaAccess } from "@/src/server/memberships";

const updateStatusSchema = z
  .object({
    mediaVersionId: z.string().cuid().optional(),
    status: z.nativeEnum(ApprovalStatus),
    note: z.string().trim().max(500).optional(),
    airedAt: z.string().datetime().optional()
  })
  .superRefine((value, ctx) => {
    if (value.status === ApprovalStatus.AIRED && !value.airedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["airedAt"],
        message: "airedAt is required when status is AIRED"
      });
    }

    if (value.status !== ApprovalStatus.AIRED && value.airedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["airedAt"],
        message: "airedAt is only allowed when status is AIRED"
      });
    }
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params;
    const payload = updateStatusSchema.parse(await request.json());

    const { userId, media } = await requireMediaAccess(
      mediaId,
      [WorkspaceRole.OWNER_ADMIN, WorkspaceRole.EDITOR, WorkspaceRole.REVIEWER],
      { allowVisibility: true }
    );
    const user = await syncUserProfile(userId);
    const platformAccess = await getPlatformAccess(user.email);

    if (!platformAccess.canManageWorkspaces) {
      throw new Error("FORBIDDEN");
    }

    const targetVersionId = payload.mediaVersionId ?? media.currentVersionId;

    if (!targetVersionId) {
      throw new Error("BAD_REQUEST");
    }

    const version = await prisma.mediaVersion.findUnique({
      where: { id: targetVersionId }
    });

    if (!version || version.mediaItemId !== media.id) {
      throw new Error("NOT_FOUND");
    }

    if (!isApprovalTransitionAllowed(version.approvalStatus, payload.status)) {
      throw new Error("BAD_REQUEST");
    }

    const airedAtValue =
      payload.status === ApprovalStatus.AIRED && payload.airedAt
        ? new Date(payload.airedAt)
        : null;

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.mediaVersion.update({
        where: { id: version.id },
        data: {
          approvalStatus: payload.status,
          airedAt: payload.status === ApprovalStatus.AIRED ? airedAtValue : null
        },
        select: {
          id: true,
          approvalStatus: true,
          airedAt: true,
          updatedAt: true
        }
      });

      await tx.approvalEvent.create({
        data: {
          mediaVersionId: version.id,
          status: payload.status,
          note: payload.note,
          changedById: userId
        }
      });

      await tx.activityEvent.create({
        data: {
          workspaceId: media.project.workspaceId,
          projectId: media.project.id,
          mediaItemId: media.id,
          mediaVersionId: version.id,
          actorId: userId,
          type: "media.approval.updated",
          payload: {
            from: version.approvalStatus,
            to: payload.status,
            ...(payload.note !== undefined ? { note: payload.note } : {}),
            ...(airedAtValue ? { airedAt: airedAtValue.toISOString() } : {})
          }
        }
      });

      await tx.auditLog.create({
        data: {
          workspaceId: media.project.workspaceId,
          projectId: media.project.id,
          mediaItemId: media.id,
          mediaVersionId: version.id,
          actorId: userId,
          action: "media.approval.update",
          targetType: "MediaVersion",
          targetId: version.id,
          metadata: {
            from: version.approvalStatus,
            to: payload.status,
            ...(payload.note !== undefined ? { note: payload.note } : {}),
            ...(airedAtValue ? { airedAt: airedAtValue.toISOString() } : {})
          }
        }
      });

      return next;
    });

    return ok(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
