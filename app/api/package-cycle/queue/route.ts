import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { DATE_KEY_PATTERN } from "@/src/lib/show-assignment";
import { requirePublishingViewer } from "@/src/server/publishing-access";
import { setQueuedForAir } from "@/src/server/publishing-queue";
import { loadPublishingQueue } from "@/src/server/publishing-queue-data";

const schema = z.object({
  rowId: z.string().min(1),
  queued: z.boolean(),
  showDate: z.string().regex(DATE_KEY_PATTERN).nullable().optional()
});

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    // Website managers read the queue; only producers edit it or see unqueued packages.
    await requirePublishingViewer(user.id, access.role);
    const canEdit = hasPlatformRole(access.role, "ASSOCIATE_PRODUCER");

    const wantCandidates = canEdit && new URL(request.url).searchParams.get("candidates") === "1";
    return ok(await loadPublishingQueue({ canEdit, wantCandidates }));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const payload = schema.parse(await request.json());
    const row = await setQueuedForAir(payload.rowId, payload.queued, payload.showDate);
    return ok({
      ok: true,
      queuedForShowDate: row.queuedForShowDate,
      queuedForAirAt: row.queuedForAirAt?.toISOString() ?? null
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
