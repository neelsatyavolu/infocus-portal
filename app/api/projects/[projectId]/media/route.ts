import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { fail, ok } from "@/src/lib/http";
import { serializeMediaRows } from "@/src/server/media-json";
import { requireProjectRole } from "@/src/server/memberships";
import { getProjectMediaPage, normalizeProjectMediaPage } from "@/src/server/project-media";

const querySchema = z.object({
  scope: z.enum(["active", "deleted"]).default("active"),
  folderId: z.string().trim().min(1).max(200).default("all"),
  filter: z.enum(["all", "ready", "in-progress", "failed"]).default("all"),
  sort: z.enum(["recent", "name", "status"]).default("recent"),
  page: z.string().max(10).optional()
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      scope: url.searchParams.get("scope") ?? undefined,
      folderId: url.searchParams.get("folderId") ?? undefined,
      filter: url.searchParams.get("filter") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
      page: url.searchParams.get("page") ?? undefined
    });
    if (!parsed.success) {
      return fail("Invalid media list options.", 400);
    }
    const { scope, folderId, filter, sort } = parsed.data;
    const page = normalizeProjectMediaPage(parsed.data.page);

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

    // Rows carry storageSizeBytes as BigInt, which JSON cannot encode; versions also get the poster URL.
    return ok({ ...media, items: await serializeMediaRows(media.items) });
  } catch (error) {
    return handleRouteError(error);
  }
}
