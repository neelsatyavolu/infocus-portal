import { handleRouteError } from "@/src/lib/api-errors";
import { fail, ok } from "@/src/lib/http";
import { requireProjectRole } from "@/src/server/memberships";
import {
  getProjectDownloadErrorResponse,
  getProjectDownloadManifest
} from "@/src/server/project-download";
import { refreshProjectDownloadReadiness } from "@/src/server/project-download-readiness";

// Manifest endpoint for client-side zipping. Returns JSON listing every entry
// with a signed Bunny CDN URL (videos) or inline base64 (images). The browser
// fetches each URL directly and assembles the archive locally via client-zip,
// avoiding Vercel's serverless function maxDuration cap entirely.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    await requireProjectRole(projectId, undefined, {
      allowVisibility: true
    });
    await refreshProjectDownloadReadiness(projectId);

    const manifest = await getProjectDownloadManifest(projectId);
    return ok(manifest);
  } catch (error) {
    if (
      error instanceof Error &&
      ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "BAD_REQUEST", "TOO_MANY_REQUESTS"].includes(
        error.message
      )
    ) {
      return handleRouteError(error);
    }

    const resolved = getProjectDownloadErrorResponse(error);
    return fail(resolved.message, resolved.status);
  }
}
