import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { okUnmapped } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const users = await prisma.user.findMany({
      orderBy: [{ name: "asc" }, { email: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        email: true,
        name: true,
        nickname: true,
        createdAt: true
      }
    });

    return okUnmapped(users);
  } catch (error) {
    return handleRouteError(error);
  }
}
