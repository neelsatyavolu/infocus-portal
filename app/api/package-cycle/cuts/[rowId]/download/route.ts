import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { ARollDownloadError } from "@/src/server/a-roll-download";
import { resolveCutDownloadUrl } from "@/src/server/cut-download";

export const maxDuration = 60;

const versionSchema = z.string().min(1).max(64);

async function resolveUrl(request: Request, params: Promise<{ rowId: string }>) {
  const { rowId } = await params;
  const parsed = versionSchema.safeParse(new URL(request.url).searchParams.get("version"));
  if (!parsed.success) {
    throw new ARollDownloadError("Pick a version to download.", 400);
  }
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  return resolveCutDownloadUrl({ userId, role: access.role, rowId, versionId: parsed.data });
}

function errorResponse(error: unknown) {
  return error instanceof ARollDownloadError ? fail(error.message, error.status) : handleRouteError(error);
}

/** The page checks first, so a refusal shows as a toast instead of a downloaded error page. */
export async function HEAD(request: Request, { params }: { params: Promise<{ rowId: string }> }) {
  try {
    await resolveUrl(request, params);
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = errorResponse(error);
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    const message = body?.error?.message ?? "This download is not available.";
    return new Response(null, {
      status: response.status,
      headers: { "Cache-Control": "private, no-store", "x-infocus-error-message": encodeURIComponent(message) }
    });
  }
}

/** GET ?version=… — redirects to the signed original of that Initial Cut or Final Cut version. */
export async function GET(request: Request, { params }: { params: Promise<{ rowId: string }> }) {
  try {
    const location = await resolveUrl(request, params);
    return new Response(null, {
      status: 302,
      headers: { "Cache-Control": "private, no-store", Location: location }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
