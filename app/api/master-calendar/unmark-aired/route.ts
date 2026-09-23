import { z } from "zod";
import { ApprovalStatus } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

const payloadSchema = z.object({
  mediaItemId: z.string().cuid()
});

const CALENDAR_MARK_NOTE_PREFIX = "Marked aired from master calendar";

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

    if (!media || media.deletedAt || !media.currentVersionId) {
      return ok({ reverted: false, reason: "not_found" });
    }

    const versionId = media.currentVersionId;

    const version = await prisma.mediaVersion.findUnique({
      where: { id: versionId },
      select: { approvalStatus: true, airedAt: true }
    });

    if (!version || version.approvalStatus !== ApprovalStatus.AIRED) {
      return ok({ reverted: false, reason: "not_aired" });
    }

    const latestAiredEvent = await prisma.approvalEvent.findFirst({
      where: { mediaVersionId: versionId, status: ApprovalStatus.AIRED },
      orderBy: { createdAt: "desc" },
      select: { note: true }
    });

    const calendarManaged =
      latestAiredEvent?.note?.startsWith(CALENDAR_MARK_NOTE_PREFIX) ?? false;

    if (!calendarManaged) {
      return ok({ reverted: false, reason: "manual" });
    }

    const otherPill = await prisma.masterCalendarEntry.findFirst({
      where: { content: { contains: `data-package-id="${parsed.mediaItemId}"` } },
      select: { date: true }
    });

    if (otherPill) {
      return ok({ reverted: false, reason: "other_pill_exists" });
    }

    const priorEvent = await prisma.approvalEvent.findFirst({
      where: {
        mediaVersionId: versionId,
        status: { not: ApprovalStatus.AIRED }
      },
      orderBy: { createdAt: "desc" },
      select: { status: true }
    });

    const priorStatus = priorEvent?.status ?? ApprovalStatus.APPROVED;

    await prisma.$transaction(async (tx) => {
      await tx.mediaVersion.update({
        where: { id: versionId },
        data: {
          approvalStatus: priorStatus,
          airedAt: null
        }
      });

      await tx.approvalEvent.create({
        data: {
          mediaVersionId: versionId,
          status: priorStatus,
          note: "Reverted by master calendar (pill removed).",
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
            from: ApprovalStatus.AIRED,
            to: priorStatus,
            source: "master-calendar",
            reason: "pill_removed"
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
            from: ApprovalStatus.AIRED,
            to: priorStatus,
            source: "master-calendar",
            reason: "pill_removed"
          }
        }
      });
    });

    return ok({ reverted: true, status: priorStatus });
  } catch (error) {
    return handleRouteError(error);
  }
}
