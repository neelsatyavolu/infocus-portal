import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { canComment } from "@/src/lib/rbac";
import { parseImportedCommentsCsv } from "@/src/lib/comment-import-csv";
import { fail, ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { DEFAULT_REVIEW_FPS } from "@/src/lib/timecode";
import { requireCommentActor } from "@/src/server/comment-access";

/** One import is one review's notes; more than this is almost certainly the wrong file. */
const MAX_IMPORTED_COMMENTS = 1000;

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

    if (parsed.comments.length > MAX_IMPORTED_COMMENTS) {
      return fail(
        `This CSV has ${parsed.comments.length} comments. Import at most ${MAX_IMPORTED_COMMENTS} at a time.`,
        400
      );
    }

    // "Commented At" keeps the original review's history; a clock-skewed or future date is clamped to now.
    const now = new Date();
    const [createdComments] = await prisma.$transaction([
      prisma.reviewComment.createManyAndReturn({
        data: parsed.comments.map((imported) => ({
          mediaVersionId: context.mediaVersion.id,
          authorId: context.actorId,
          targetType: "TIMECODE" as const,
          timeSeconds: imported.timeSeconds,
          frameNumber: imported.frameNumber,
          body: imported.body,
          createdAt: imported.createdAt > now ? now : imported.createdAt
        }))
      }),
      prisma.activityEvent.create({
        data: {
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          mediaItemId: context.mediaVersion.mediaItemId,
          mediaVersionId: context.mediaVersion.id,
          actorId: context.actorId,
          type: "comment.import",
          payload: {
            importedCount: parsed.comments.length,
            skippedCount: parsed.skippedCount
          }
        }
      }),
      prisma.auditLog.create({
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
            importedCount: parsed.comments.length,
            skippedCount: parsed.skippedCount,
            totalRows: parsed.totalRows,
            fps: DEFAULT_REVIEW_FPS
          }
        }
      })
    ]);

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
