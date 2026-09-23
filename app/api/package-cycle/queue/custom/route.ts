import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { completeCustomQueueUpload, initCustomQueueUpload } from "@/src/server/publishing-queue-custom";

const initSchema = z.object({
  action: z.literal("init"),
  title: z.string().trim().min(1).max(150),
  fileName: z.string().trim().min(1).max(255)
});

const completeSchema = z.object({
  action: z.literal("complete"),
  title: z.string().trim().min(1).max(150),
  mediaId: z.string().min(1),
  versionId: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const body = await request.json();
    if (body?.action === "init") {
      const payload = initSchema.parse(body);
      const result = await initCustomQueueUpload({
        userId,
        title: payload.title,
        fileName: payload.fileName
      });
      return ok(result);
    }

    const payload = completeSchema.parse(body);
    const row = await completeCustomQueueUpload({
      userId,
      title: payload.title,
      mediaId: payload.mediaId,
      versionId: payload.versionId
    });
    return ok({
      ok: true,
      rowId: row.id,
      queuedForShowDate: row.queuedForShowDate,
      queuedForAirAt: row.queuedForAirAt?.toISOString() ?? null
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
