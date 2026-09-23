import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { requireProjectRole } from "@/src/server/memberships";
import {
  getProjectMediaPage,
  normalizeProjectMediaPage,
  type ProjectMediaFilter,
  type ProjectMediaScope,
  type ProjectMediaSort
} from "@/src/server/project-media";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const url = new URL(request.url);
    const scope = (url.searchParams.get("scope") ?? "active") as ProjectMediaScope;
    const folderId = url.searchParams.get("folderId") ?? "all";
    const filter = (url.searchParams.get("filter") ?? "all") as ProjectMediaFilter;
    const sort = (url.searchParams.get("sort") ?? "recent") as ProjectMediaSort;
    const page = normalizeProjectMediaPage(url.searchParams.get("page") ?? undefined);

    await requireProjectRole(projectId, undefined, {
      allowVisibility: true
    });

    const media = await getProjectMediaPage({
      projectId,
      scope,
      folderId,
      filter,
      sort,
      page
    });

    return ok(media);
  } catch (error) {
    return handleRouteError(error);
  }
}
