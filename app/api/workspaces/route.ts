import { WorkspaceRole } from "@prisma/client";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getCanonicalWorkspace } from "@/src/lib/canonical-workspace";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { buildWorkspaceAccessWhere } from "@/src/server/workspace-access";

/** Multi-workspace creation is retired — only InFocus News exists. */
export async function POST(_request: Request) {
  try {
    await requireUserId();
    throw new Error("FORBIDDEN");
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");

    // Always prefer the single canonical workspace for the product.
    const canonical = await getCanonicalWorkspace();

    if (scope === "all") {
      if (!access.canManageWorkspaces) {
        throw new Error("FORBIDDEN");
      }

      const workspace = await prisma.workspace.findUnique({
        where: { id: canonical.id },
        select: {
          id: true,
          name: true,
          slug: true,
          visibility: true,
          createdAt: true,
          updatedAt: true,
          visibilityMembers: {
            select: {
              userId: true
            }
          },
          _count: {
            select: {
              projects: true
            }
          }
        }
      });

      if (!workspace) {
        return ok([]);
      }

      return ok([
        {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          role: "ASSOCIATE_PRODUCER",
          visibility: workspace.visibility,
          specificMemberUserIds: workspace.visibilityMembers.map((entry) => entry.userId),
          projectCount: workspace._count.projects,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt
        }
      ]);
    }

    const workspaces = await prisma.workspace.findMany({
      where: {
        AND: [
          { id: canonical.id },
          buildWorkspaceAccessWhere({
            userId,
            platformRole: access.role
          })
        ]
      },
      select: {
        id: true,
        name: true,
        slug: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
        members: {
          where: { userId },
          select: {
            role: true
          },
          take: 1
        },
        _count: {
          select: {
            projects: true
          }
        }
      },
      orderBy: { name: "asc" }
    });

    // Producers with platform access still see the canonical workspace even
    // without an explicit membership row.
    if (workspaces.length === 0 && access.canManageWorkspaces) {
      return ok([
        {
          id: canonical.id,
          name: canonical.name,
          slug: canonical.slug,
          role: WorkspaceRole.OWNER_ADMIN,
          visibility: canonical.visibility,
          projectCount: await prisma.project.count({ where: { workspaceId: canonical.id } }),
          createdAt: canonical.createdAt,
          updatedAt: canonical.updatedAt
        }
      ]);
    }

    return ok(
      workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        role: workspace.members[0]?.role ?? WorkspaceRole.REVIEWER,
        visibility: workspace.visibility,
        projectCount: workspace._count.projects,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt
      }))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
