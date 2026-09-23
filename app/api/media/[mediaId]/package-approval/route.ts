import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { requireMediaAccess } from "@/src/server/memberships";
import {
  findProgressRowForMedia,
  approveAnyway,
  loadApprovalView,
  recordDecision,
  unapproveCut,
  setControversial,
  submitCutReview,
  submitForReview
} from "@/src/server/package-approval-service";

const payloadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT") }),
  z.object({ action: z.literal("UNAPPROVE") }),
  z.object({ action: z.literal("APPROVE_ANYWAY") }),
  z.object({ action: z.literal("SUBMIT_REVIEW"), mediaVersionId: z.string().optional() }),
  z.object({
    action: z.literal("DECIDE"),
    approved: z.boolean(),
    mediaVersionId: z.string().optional(),
    note: z.string().trim().max(2000).optional()
  }),
  z.object({ action: z.literal("SET_CONTROVERSIAL"), controversial: z.boolean() })
]);

/**
 * Approval lives on the package, so a media item resolves to its progress row
 * first. A cut that has not been linked to a package has no chain to show.
 */
async function resolveRowId(mediaId: string) {
  const row = await findProgressRowForMedia(mediaId);

  if (!row) {
    throw new Error("NO_PACKAGE");
  }

  return row.id;
}

export async function GET(_request: Request, context: { params: Promise<{ mediaId: string }> }) {
  try {
    const { mediaId } = await context.params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    // Cycle cuts live on the system project; producers are not members there.
    await requireMediaAccess(mediaId, undefined, { allowVisibility: true });

    const rowId = await resolveRowId(mediaId);
    const access = await getPlatformAccess(user.email);
    const view = await loadApprovalView(rowId, { userId, email: user.email, role: access.role });

    return ok({ mediaItemId: mediaId, ...view });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_PACKAGE") {
      return fail("This media item is not linked to a package on the progress sheet.", 404);
    }
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ mediaId: string }> }) {
  try {
    const { mediaId } = await context.params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    await requireMediaAccess(mediaId, undefined, { allowVisibility: true });

    const rate = limitByKey(getRequestKey(request, "package:approval:write"), {
      max: 60,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const rowId = await resolveRowId(mediaId);
    const access = await getPlatformAccess(user.email);
    const payload = payloadSchema.parse(await request.json());

    if (payload.action === "SUBMIT") {
      await submitForReview(rowId);
    } else if (payload.action === "UNAPPROVE") {
      await unapproveCut(rowId, { userId, email: user.email, role: access.role });
    } else if (payload.action === "APPROVE_ANYWAY") {
      await approveAnyway(rowId, { userId, email: user.email, role: access.role });
    } else if (payload.action === "SUBMIT_REVIEW") {
      await submitCutReview(rowId, { userId, email: user.email, role: access.role }, payload.mediaVersionId);
    } else if (payload.action === "SET_CONTROVERSIAL") {
      if (access.role !== "EXECUTIVE_PRODUCER" && access.role !== "SUPER_ADMIN") {
        throw new Error("FORBIDDEN");
      }

      await setControversial(rowId, payload.controversial);
    } else {
      await recordDecision(
        rowId,
        { userId, email: user.email, role: access.role },
        payload.approved,
        payload.note ?? "",
        payload.mediaVersionId
      );
    }

    const view = await loadApprovalView(rowId, { userId, email: user.email, role: access.role });

    return ok({ mediaItemId: mediaId, ...view });
  } catch (error) {
    if (error instanceof Error && error.message === "NO_PACKAGE") {
      return fail("This media item is not linked to a package on the progress sheet.", 404);
    }
    if (error instanceof Error && error.message === "BAD_REQUEST") {
      return fail(
        "The package is missing the cut this stage reviews. Link the initial cut before submitting, and the final cut before executive sign-off.",
        400
      );
    }
    return handleRouteError(error);
  }
}
