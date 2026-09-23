import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireProjectRole } from "@/src/server/memberships";
import { getProjectStorageSnapshot } from "@/src/server/storage-cache";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await requireProjectRole(projectId, undefined, {
      allowVisibility: true
    });
    const storage = await getProjectStorageSnapshot(projectId);

    return ok({
      totalBytes: Math.max(0, Math.round(storage.totalBytes)),
      isEstimated: storage.isEstimated,
      stale: storage.stale,
      updatedAt: storage.updatedAt
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
