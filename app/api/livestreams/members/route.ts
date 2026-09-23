import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { requireLivestreamManagerAccess } from "@/src/server/livestream-access";

/** Member picker for managers (attendees / manager assignment). */
export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    await requireLivestreamManagerAccess(user.id, access.role);

    const members = await prisma.user.findMany({
      select: { id: true, name: true, nickname: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }]
    });

    return ok({ members });
  } catch (error) {
    return handleRouteError(error);
  }
}
