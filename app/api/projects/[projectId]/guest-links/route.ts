import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { requireProjectRole } from "@/src/server/memberships";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await requireProjectRole(projectId);

    const links = await prisma.guestLink.findMany({
      where: {
        projectId
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        id: true,
        token: true,
        permission: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true
      }
    });

    return ok(links);
  } catch (error) {
    return handleRouteError(error);
  }
}
