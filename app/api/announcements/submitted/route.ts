import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { z } from "zod";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { ok } from "@/src/lib/http";
import { deleteSubmittedAnnouncement, fetchSubmittedAnnouncements } from "@/src/server/announcement-submissions";

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    const data = await fetchSubmittedAnnouncements({ includeSchoologyOnly: true });
    return ok({ ...data, canDelete: hasPlatformRole(access.role, "ASSOCIATE_PRODUCER") });
  } catch (error) {
    return handleRouteError(error);
  }
}

const deleteSchema = z.object({ id: z.string().min(1).max(200) });

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) throw new Error("FORBIDDEN");
    const { id } = deleteSchema.parse(await request.json());
    await deleteSubmittedAnnouncement(id);
    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
