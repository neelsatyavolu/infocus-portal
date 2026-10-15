import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import {
  assertFeedbackStage,
  createStageComment,
  listStageComments,
  loadStageUnreadCount,
  markStageCommentsRead,
  requireStageCommentAccess,
  setStageCommentResolved
} from "@/src/server/package-stage-comments";

const createSchema = z.object({
  rowId: z.string().min(1),
  stage: z.string().min(1),
  body: z.string().trim().min(1).max(2000)
});

const resolveSchema = z.object({
  id: z.string().min(1),
  resolved: z.boolean()
});

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const { searchParams } = new URL(request.url);
    const rowId = searchParams.get("rowId") ?? "";
    const stage = assertFeedbackStage(searchParams.get("stage") ?? "");
    if (!rowId) {
      return fail("Missing package.", 400);
    }

    await requireStageCommentAccess(rowId, userId, access.role);
    const comments = await listStageComments(rowId, stage);
    if (searchParams.get("markRead") === "1") {
      await markStageCommentsRead({ userId, rowId, stage });
      return ok({ comments, unread: 0 });
    }
    const unread = await loadStageUnreadCount({ userId, rowId, stage });
    return ok({ comments, unread });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const rate = limitByKey(getRequestKey(request, "stage-comments:create"), {
      max: 30,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = createSchema.parse(await request.json());
    const stage = assertFeedbackStage(payload.stage);
    await requireStageCommentAccess(payload.rowId, userId, access.role, { write: true, stage });
    const comment = await createStageComment({
      rowId: payload.rowId,
      stage,
      authorId: userId,
      body: payload.body
    });
    return ok({ comment }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Mark a note resolved (`resolved: true`) or open again. */
export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const rate = limitByKey(getRequestKey(request, "stage-comments:resolve"), {
      max: 60,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = resolveSchema.parse(await request.json());
    const comment = await setStageCommentResolved({
      commentId: payload.id,
      userId,
      role: access.role,
      resolved: payload.resolved
    });
    return ok({ comment });
  } catch (error) {
    return handleRouteError(error);
  }
}
