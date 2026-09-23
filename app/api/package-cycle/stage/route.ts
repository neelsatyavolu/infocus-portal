import { recordAssociateReviewHistory } from "@/src/server/associate-review-history";
import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { isCycleStageSlug } from "@/src/lib/package-cycle-gates";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { producerMayActOnPackage } from "@/src/lib/package-producer-assignment";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";
import { loadCycleStageView } from "@/src/server/package-cycle-stage";

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("stage") ?? "";
    if (!slug) {
      const { loadStudentNavGates } = await import("@/src/server/package-cycle-stage");
      return ok(await loadStudentNavGates(userId));
    }
    if (!isCycleStageSlug(slug)) {
      return fail("Invalid stage.", 400);
    }

    const rowId = searchParams.get("rowId");
    const cycle = searchParams.get("cycle");
    const cycleNumber = cycle ? Number(cycle) : null;

    const reviewStageRaw = Number(searchParams.get("reviewStage") ?? "");
    const reviewStage =
      reviewStageRaw === 1 || reviewStageRaw === 2 || reviewStageRaw === 3 ? reviewStageRaw : null;

    const view = await loadCycleStageView({
      userId,
      role: access.role,
      slug,
      rowId,
      cycleNumber,
      reviewStage
    });

    return ok(view);
  } catch (error) {
    return handleRouteError(error);
  }
}

const patchSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("approve-aroll"),
    rowId: z.string().min(1),
    approved: z.boolean(),
    feedback: z.string().trim().max(2000).optional()
  }),
  z.object({
    kind: z.literal("approve-pitching"),
    rowId: z.string().min(1),
    approved: z.boolean(),
    feedback: z.string().trim().max(2000).optional()
  })
]);

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const payload = patchSchema.parse(await request.json());
    const existing = await prisma.packageProgressRow.findUnique({
      where: { id: payload.rowId },
      select: {
        pitching: true,
        aRollBRoll: true,
        assignedProducerUserId: true,
        members: { select: { userId: true } }
      }
    });
    if (!existing) {
      throw new Error("NOT_FOUND");
    }
    if (!producerMayActOnPackage(access.role, userId, existing)) {
      throw new Error("FORBIDDEN");
    }

    await prisma.$transaction(async (tx) => {
      await tx.packageProgressRow.update({
        where: { id: payload.rowId },
        data: payload.kind === "approve-pitching"
          ? { pitching: payload.approved }
          : { aRollBRoll: payload.approved }
      });
      if (payload.approved && !(payload.kind === "approve-pitching" ? existing.pitching : existing.aRollBRoll)) {
        await recordAssociateReviewHistory({
          rowId: payload.rowId, stage: payload.kind === "approve-pitching" ? "pitching" : "a-roll",
          kind: "review", actorId: userId, note: payload.feedback
        }, tx);
      }
    });

    const wasApproved = payload.kind === "approve-pitching" ? existing.pitching : existing.aRollBRoll;
    const stage = payload.kind === "approve-pitching" ? "pitching" : "a-roll";
    const excerpt = payload.approved ? payload.feedback?.trim() || "" : "";
    if (payload.approved && excerpt) {
      const { createApprovalStageComment } = await import("@/src/server/package-stage-comments");
      await createApprovalStageComment({
        rowId: payload.rowId,
        stage,
        authorId: userId,
        body: excerpt
      });
    }
    if (payload.approved && !wasApproved) {
      const { notifyCheckInApproved } = await import("@/src/server/package-review-notify");
      void notifyCheckInApproved({
        progressRowId: payload.rowId,
        stage,
        reviewerName: userDisplayName(user) || user.email || "A producer",
        excludeUserId: userId,
        excerpt
      }).catch((error) => console.error("notifyCheckInApproved failed", error));
    }

    return ok({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
