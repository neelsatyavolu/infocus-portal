import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { isCycleStageSlug } from "@/src/lib/package-cycle-gates";
import { isRollKind } from "@/src/lib/package-roll-kind";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { completeCycleStageUpload, initCycleStageUpload } from "@/src/server/package-cycle-stage";

const initSchema = z.object({
  action: z.literal("init"),
  rowId: z.string().min(1),
  stage: z.string(),
  title: z.string().trim().min(1).max(150),
  fileName: z.string().trim().min(1).max(255),
  rollKind: z.string().optional()
});

const completeSchema = z.object({
  action: z.literal("complete"),
  rowId: z.string().min(1),
  stage: z.string(),
  mediaId: z.string().min(1),
  versionId: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const body = await request.json();
    const action = body?.action;

    if (action === "init") {
      const payload = initSchema.parse(body);
      if (!isCycleStageSlug(payload.stage)) {
        throw new Error("BAD_REQUEST");
      }
      const result = await initCycleStageUpload({
        userId,
        role: access.role,
        rowId: payload.rowId,
        slug: payload.stage,
        title: payload.title,
        fileName: payload.fileName,
        rollKind: isRollKind(payload.rollKind) ? payload.rollKind : null
      });
      return ok(result);
    }

    const payload = completeSchema.parse(body);
    if (!isCycleStageSlug(payload.stage)) {
      throw new Error("BAD_REQUEST");
    }
    await completeCycleStageUpload({
      userId,
      role: access.role,
      rowId: payload.rowId,
      slug: payload.stage,
      mediaId: payload.mediaId,
      versionId: payload.versionId
    });
    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
