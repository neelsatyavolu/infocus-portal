import { z } from "zod";
import { ApprovalStatus } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

const payloadSchema = z.object({
  mediaItemId: z.string().cuid(),
  date: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
});

function airedAtForDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const parsed = payloadSchema.parse(await request.json());

    const media = await prisma.mediaItem.findUnique({
      where: { id: parsed.mediaItemId },
      select: {
        id: true,
        currentVersionId: true,
        deletedAt: true,
        project: { select: { id: true, workspaceId: true } }
      }
    });

    if (!media || media.deletedAt) {
      return fail("Media not found.", 404);
    }
    if (!media.currentVersionId) {
      return fail("Media has no current version.", 400);
    }

    const versionId = media.currentVersionId;
    const airedAt = airedAtForDate(parsed.date);

    const updated = await prisma.$transaction(async (tx) => {
      const previous = await tx.mediaVersion.findUnique({
        where: { id: versionId },
        select: { approvalStatus: true, airedAt: true }
      });

      const next = await tx.mediaVersion.update({
        where: { id: versionId },
        data: {
          approvalStatus: ApprovalStatus.AIRED,
          airedAt
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
          mediaVersionId: versionId,
          status: ApprovalStatus.AIRED,
          note: `Marked aired from master calendar (${parsed.date}).`,
          changedById: userId
        }
      });

      await tx.activityEvent.create({
        data: {
          workspaceId: media.project.workspaceId,
          projectId: media.project.id,
          mediaItemId: media.id,
          mediaVersionId: versionId,
          actorId: userId,
          type: "media.approval.updated",
          payload: {
            from: previous?.approvalStatus ?? null,
            to: ApprovalStatus.AIRED,
            airedAt: airedAt.toISOString(),
            source: "master-calendar"
          }
        }
      });

      await tx.auditLog.create({
        data: {
          workspaceId: media.project.workspaceId,
          projectId: media.project.id,
          mediaItemId: media.id,
          mediaVersionId: versionId,
          actorId: userId,
          action: "media.approval.update",
          targetType: "MediaVersion",
          targetId: versionId,
          metadata: {
            from: previous?.approvalStatus ?? null,
            to: ApprovalStatus.AIRED,
            airedAt: airedAt.toISOString(),
            source: "master-calendar"
          }
        }
      });

      return next;
    });

    return ok({
      mediaItemId: media.id,
      mediaVersionId: versionId,
      approvalStatus: updated.approvalStatus,
      airedAt: updated.airedAt?.toISOString() ?? null
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
