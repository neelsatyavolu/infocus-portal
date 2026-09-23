import { handleRouteError } from "@/src/lib/api-errors";
import { fail } from "@/src/lib/http";
import { requireProjectRole } from "@/src/server/memberships";
import {
  buildProjectDownloadScript,
  getProjectDownloadErrorResponse
} from "@/src/server/project-download";
import { refreshProjectDownloadReadiness } from "@/src/server/project-download-readiness";

// Returns a paste-ready bash script that downloads every project asset
// directly from Bunny CDN via curl, decodes inline image base64, and zips
// the result with `zip -r0`. Useful when the in-browser download path is
// rate-limited and the user wants to run the transfer in a Terminal where
// they can background it, retry, or use their own download tooling.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    await requireProjectRole(projectId, undefined, {
      allowVisibility: true
    });
    await refreshProjectDownloadReadiness(projectId);

    // Use the request's own origin as the curl Referer so Bunny's HotLink
    // protection (configured to allow this domain) serves curl the same fast
    // path it serves the in-browser download.
    const refererOrigin = new URL(request.url).origin;
    const script = await buildProjectDownloadScript(projectId, refererOrigin);
    return new Response(script, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
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
