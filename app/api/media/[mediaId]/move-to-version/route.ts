import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { canManageProjectMedia } from "@/src/lib/rbac";
import { moveMediaIntoVersion } from "@/src/server/media-version-move";
import { recomputeForProjectName } from "@/src/server/cycle-cut-status";
import { requireMediaAccess } from "@/src/server/memberships";

const moveToVersionSchema = z.object({
  targetMediaId: z.string().cuid()
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params;
    const payload = moveToVersionSchema.parse(await request.json());
    const { userId, membership } = await requireMediaAccess(mediaId, undefined, { allowVisibility: true });
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!canManageProjectMedia(membership.role, access.role)) {
      throw new Error("FORBIDDEN");
    }

    const result = await moveMediaIntoVersion({
      sourceMediaId: mediaId,
      targetMediaId: payload.targetMediaId,
      actorId: userId
    });

    await recomputeForProjectName(result.projectName);

    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
