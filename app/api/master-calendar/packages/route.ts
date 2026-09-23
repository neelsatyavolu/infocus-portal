import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

const MAX_RESULTS = 20;

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") ?? "").trim();

    if (query.length === 0) {
      return ok({ results: [] });
    }
    if (query.length > 120) {
      return fail("Query too long.", 400);
    }

    const items = await prisma.mediaItem.findMany({
      where: {
        deletedAt: null,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { project: { name: { contains: query, mode: "insensitive" } } }
        ]
      },
      select: {
        id: true,
        title: true,
        currentVersionId: true,
        project: { select: { id: true, name: true } },
        currentVersion: {
          select: { approvalStatus: true, airedAt: true }
        }
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_RESULTS
    });

    return ok({
      results: items.map((item) => ({
        id: item.id,
        title: item.title,
        projectId: item.project.id,
        projectName: item.project.name,
        currentVersionId: item.currentVersionId,
        approvalStatus: item.currentVersion?.approvalStatus ?? null,
        airedAt: item.currentVersion?.airedAt?.toISOString() ?? null
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
