import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireProjectRole } from "@/src/server/memberships";
import { listWorkspaceAccessUsers } from "@/src/server/workspace-access";
import { userDisplayName } from "@/src/lib/user-display";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const access = await requireProjectRole(projectId, undefined, {
      allowVisibility: true
    });

    const data = (await listWorkspaceAccessUsers(access.project.workspaceId)).map((user) => ({
      userId: user.id,
      name: userDisplayName(user) || user.name,
      email: user.email
    }));

    return ok(data);
  } catch (error) {
    return handleRouteError(error);
  }
}
