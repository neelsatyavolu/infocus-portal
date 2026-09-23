import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireProjectRole } from "@/src/server/memberships";
import { getProjectShellData } from "@/src/server/project-shell";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const url = new URL(request.url);
    const mediaId = url.searchParams.get("mediaId");
    const access = await requireProjectRole(projectId, undefined, {
      allowVisibility: true
    });

    const shell = await getProjectShellData({
      projectId,
      mediaId,
      canViewShareLinks: access.isDirectMember
    });

    return ok(shell);
  } catch (error) {
    return handleRouteError(error);
  }
}
