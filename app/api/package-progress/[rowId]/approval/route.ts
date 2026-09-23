import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import {
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

async function requireRow(rowId: string) {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: rowId },
    select: { id: true }
  });

  if (!row) {
    throw new Error("NOT_FOUND");
  }

  return row.id;
}

export async function GET(_request: Request, context: { params: Promise<{ rowId: string }> }) {
  try {
    const { rowId } = await context.params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    await requireRow(rowId);
    const view = await loadApprovalView(rowId, { userId, email: user.email, role: access.role });

    return ok(view);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ rowId: string }> }) {
  try {
    const { rowId } = await context.params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const rate = limitByKey(getRequestKey(request, "package:approval:row"), {
      max: 60,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    await requireRow(rowId);
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

    return ok(view);
  } catch (error) {
    if (error instanceof Error && error.message === "BAD_REQUEST") {
      return fail(
        "The package is missing the Initial Cut this stage reviews.",
        400
      );
    }
    return handleRouteError(error);
  }
}
