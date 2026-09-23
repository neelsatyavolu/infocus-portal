import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { canComment } from "@/src/lib/rbac";
import { parseImportedCommentsCsv } from "@/src/lib/comment-import-csv";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { DEFAULT_REVIEW_FPS } from "@/src/lib/timecode";
import { requireCommentActor } from "@/src/server/comment-access";

const importCommentsRequestSchema = z.object({
  mediaVersionId: z.string().cuid(),
  csvText: z.string().min(1).max(2_000_000)
});

export async function POST(request: Request) {
  try {
    const rate = limitByKey(getRequestKey(request, "comments:import"), {
      max: 5,
      windowMs: 60 * 1000
    });

    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = importCommentsRequestSchema.parse(await request.json());
    const context = await requireCommentActor(payload.mediaVersionId);

    if (!canComment(context.role) || context.actorType !== "member") {
      throw new Error("FORBIDDEN");
    }

    if (context.mediaVersion.sourceType !== "VIDEO") {
      throw new Error("BAD_REQUEST");
    }

    const parsed = parseImportedCommentsCsv(payload.csvText, DEFAULT_REVIEW_FPS);

    if (parsed.comments.length === 0) {
      throw new Error("BAD_REQUEST");
    }

    const createdComments = await prisma.$transaction(async (tx) => {
      const created = [];

      for (const imported of parsed.comments) {
        const comment = await tx.reviewComment.create({
          data: {
            mediaVersionId: context.mediaVersion.id,
            authorId: context.actorId,
            targetType: "TIMECODE",
            timeSeconds: imported.timeSeconds,
            frameNumber: imported.frameNumber,
            body: imported.body,
            createdAt: imported.createdAt
          }
        });
        created.push(comment);
      }

      await tx.activityEvent.create({
        data: {
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          mediaItemId: context.mediaVersion.mediaItemId,
          mediaVersionId: context.mediaVersion.id,
          actorId: context.actorId,
          type: "comment.import",
          payload: {
            importedCount: created.length,
            skippedCount: parsed.skippedCount
          }
        }
      });

      await tx.auditLog.create({
        data: {
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          mediaItemId: context.mediaVersion.mediaItemId,
          mediaVersionId: context.mediaVersion.id,
          actorId: context.actorId,
          action: "comment.import",
          targetType: "MediaVersion",
          targetId: context.mediaVersion.id,
          metadata: {
            importedCount: created.length,
            skippedCount: parsed.skippedCount,
            totalRows: parsed.totalRows,
            fps: DEFAULT_REVIEW_FPS
          }
        }
      });

      return created;
    });

    return ok(
      {
        comments: createdComments,
        importedCount: createdComments.length,
        skippedCount: parsed.skippedCount,
        totalRows: parsed.totalRows
      },
      201
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
