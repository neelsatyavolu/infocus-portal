import { randomBytes } from "node:crypto";
import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import {
  ARollDownloadError,
  createARollZipStream,
  getARollDownloadPlan,
  resolveClipDownloadUrl
} from "@/src/server/a-roll-download";

export const maxDuration = 300;

const idsSchema = z.array(z.string().min(1).max(64)).max(500);

function attachmentHeader(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

async function loadPlan(request: Request, params: Promise<{ rowId: string }>) {
  const { rowId } = await params;
  const parsed = idsSchema.safeParse(new URL(request.url).searchParams.getAll("id"));
  if (!parsed.success) {
    throw new ARollDownloadError("Invalid clip selection.", 400);
  }
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  const plan = await getARollDownloadPlan({ userId, role: access.role, rowId, ids: parsed.data });
  return { plan, single: parsed.data.length === 1 && plan.clips.length === 1 };
}

/** The page checks first, so a refusal shows as a toast instead of a downloaded error page. */
export async function HEAD(request: Request, { params }: { params: Promise<{ rowId: string }> }) {
  try {
    await loadPlan(request, params);
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = error instanceof ARollDownloadError ? fail(error.message, error.status) : handleRouteError(error);
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    const message = body?.error?.message ?? "This download is not available.";
    return new Response(null, {
      status: response.status,
      // URI-encoded: header values must be ASCII and messages may quote clip titles.
      headers: { "Cache-Control": "private, no-store", "x-infocus-error-message": encodeURIComponent(message) }
    });
  }
}

/**
 * GET ?id=…&id=… — one clip redirects to its signed original (saved as a file); several, or no
 * ids (all of them), stream one zip with A-roll/ and B-roll/ folders.
 */
export async function GET(request: Request, { params }: { params: Promise<{ rowId: string }> }) {
  try {
    const { plan, single } = await loadPlan(request, params);

    if (single) {
      return new Response(null, {
        status: 302,
        headers: {
          "Cache-Control": "private, no-store",
          Location: await resolveClipDownloadUrl(plan.clips[0])
        }
      });
    }

    const requestId = randomBytes(4).toString("hex");
    return new Response(createARollZipStream(plan, requestId), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": attachmentHeader(plan.archiveFileName),
        "Content-Type": "application/zip",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if (error instanceof ARollDownloadError) {
      return fail(error.message, error.status);
    }
    return handleRouteError(error);
  }
}
