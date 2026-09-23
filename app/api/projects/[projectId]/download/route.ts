import { randomBytes } from "node:crypto";
import { handleRouteError } from "@/src/lib/api-errors";
import { fail } from "@/src/lib/http";
import { requireProjectRole } from "@/src/server/memberships";
import {
  createProjectDownloadStream,
  getProjectDownloadErrorResponse,
  getProjectDownloadPlan
} from "@/src/server/project-download";
import { refreshProjectDownloadReadiness } from "@/src/server/project-download-readiness";

// Vercel's default serverless timeout (60s on Pro) was killing zip streams
// mid-flight: a multi-GB project at Bunny's ~20 MB/s sustained rate takes
// minutes, and the function got SIGKILL'd before the central directory was
// written, producing truncated archives (no EOCD). 300s is the Pro plan max.
export const maxDuration = 300;

function newRequestId() {
  return randomBytes(4).toString("hex");
}

function errorHeaders(message: string) {
  return {
    "Cache-Control": "no-store",
    "x-infocus-error-message": message
  };
}

export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    await requireProjectRole(projectId, undefined, {
      allowVisibility: true
    });
    await refreshProjectDownloadReadiness(projectId);

    const plan = await getProjectDownloadPlan(projectId);

    return new Response(null, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "x-infocus-download-filename": plan.archiveFileName
      }
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "BAD_REQUEST", "TOO_MANY_REQUESTS"].includes(error.message)
    ) {
      return handleRouteError(error);
    }

    const resolved = getProjectDownloadErrorResponse(error);
    return new Response(null, {
      status: resolved.status,
      headers: errorHeaders(resolved.message)
    });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const requestId = newRequestId();
  try {
    const { projectId } = await params;
    console.info(
      `[project-download] id=${requestId} request-received project=${projectId} ua=${JSON.stringify(
        request.headers.get("user-agent")
      )}`
    );

    await requireProjectRole(projectId, undefined, {
      allowVisibility: true
    });
    await refreshProjectDownloadReadiness(projectId);

    const plan = await getProjectDownloadPlan(projectId);
    const stream = await createProjectDownloadStream(
      plan,
      request.headers.get("referer"),
      requestId
    );

    return new Response(stream, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${plan.archiveFileName}"`,
        "Content-Type": "application/zip",
        "X-Content-Type-Options": "nosniff",
        "x-infocus-download-id": requestId
      }
    });
  } catch (error) {
    const resolved = getProjectDownloadErrorResponse(error);
    console.error(
      `[project-download] id=${requestId} request-error status=${resolved.status} message=${JSON.stringify(
        resolved.message
      )}`
    );

    if (error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "BAD_REQUEST", "TOO_MANY_REQUESTS"].includes(error.message)) {
      return handleRouteError(error);
    }

    return fail(resolved.message, resolved.status);
  }
}
