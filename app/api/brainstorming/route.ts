import { recordAssociateReviewHistory } from "@/src/server/associate-review-history";
import { type PackageCategory } from "@prisma/client";
import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { isGoogleDocUrl } from "@/src/lib/package-brainstorm";
import { brainstormBecameReady } from "@/src/lib/package-stage-events";
import { getPlatformAccess, normalizeEmail } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { userDisplayName } from "@/src/lib/user-display";
import {
  loadStudentBrainstormPackages,
  requireBrainstormMember,
  requireBrainstormViewer,
  serializeBrainstormPackage
} from "@/src/server/package-brainstorm";
import { ensurePackageProgressDefaults } from "@/src/server/package-progress-data";
import { MAX_CYCLES_PER_SEMESTER } from "@/src/server/program-settings";

const docSchema = z.object({
  kind: z.literal("doc"),
  rowId: z.string().min(1),
  url: z.string().max(2000)
});

const approveSchema = z.object({
  kind: z.literal("approve"),
  rowId: z.string().min(1),
  approved: z.boolean(),
  feedback: z.string().trim().max(2000).optional()
});

const patchSchema = z.discriminatedUnion("kind", [docSchema, approveSchema]);

function parseCycleNumber(value: string | null) {
  if (!value) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > MAX_CYCLES_PER_SEMESTER) {
    throw new Error("BAD_REQUEST");
  }
  return number;
}

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    const { searchParams } = new URL(request.url);
    const requestedCycleNumber = parseCycleNumber(searchParams.get("cycle"));
    const cycles = await ensurePackageProgressDefaults();
    const today = new Date().toISOString().slice(0, 10);
    const activeCycleNumber =
      requestedCycleNumber ??
      cycles.find((cycle) => {
        const finalCut = cycle.finalCutDate?.toISOString().slice(0, 10) ?? null;
        return !finalCut || finalCut >= today;
      })?.cycleNumber ??
      cycles[cycles.length - 1]?.cycleNumber ??
      1;

    let producerCategory: PackageCategory | null = null;
    if (access.role === "ASSOCIATE_PRODUCER") {
      const assignment = await prisma.platformRoleAssignment.findUnique({
        where: { email: normalizeEmail(user.email) },
        select: { category: true }
      });
      producerCategory = assignment?.category ?? null;
    }

    const packages = await loadStudentBrainstormPackages(userId, activeCycleNumber, {
      platformRole: access.role,
      producerCategory
    });

    return ok({
      currentUserId: userId,
      canApprove: false,
      activeCycleNumber,
      cycles: cycles.map((cycle) => ({
        cycleNumber: cycle.cycleNumber,
        focus: cycle.focus
      })),
      packages
    });
  } catch (error) {
    if (error instanceof Error && error.message === "BAD_REQUEST") {
      return fail("Invalid cycle number.", 400);
    }
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const rate = limitByKey(getRequestKey(request, "brainstorming:patch"), {
      max: 40,
      windowMs: 60 * 1000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const payload = patchSchema.parse(await request.json());

    if (payload.kind === "doc") {
      const { row } = await requireBrainstormMember(payload.rowId, userId, user.email);
      const url = payload.url.trim();
      if (url && !isGoogleDocUrl(url)) {
        throw new Error("Paste a Google Docs or Drive link.");
      }

      const becameReady = brainstormBecameReady(
        { proofCount: row.proofOfContacts.length, docUrl: row.brainstormDocUrl },
        { proofCount: row.proofOfContacts.length, docUrl: url }
      );

      const updated = await prisma.$transaction(async (tx) => {
        const updated = await tx.packageProgressRow.update({
          where: { id: row.id },
          data: { brainstormDocUrl: url },
          include: {
            members: {
              select: {
                userId: true,
                user: { select: { id: true, name: true, nickname: true, email: true } }
              }
            },
            assignedProducer: { select: { id: true, name: true, nickname: true, email: true } },
            proofOfContacts: {
              select: { id: true, slot: true, fileName: true, mimeType: true }
            }
          }
        });
        if (becameReady) {
          await recordAssociateReviewHistory({ rowId: row.id, stage: "brainstorming", kind: "ready", actorId: userId }, tx);
        }
        return updated;
      });

      if (becameReady) {
        const { notifyBrainstormMaterialsReady } = await import("@/src/server/package-review-notify");
        void notifyBrainstormMaterialsReady(row.id).catch((error) =>
          console.error("notifyBrainstormMaterialsReady failed", error)
        );
      }

      return ok({ package: serializeBrainstormPackage(updated) });
    }

    const { isProducer, row } = await requireBrainstormViewer(payload.rowId, userId, user.email);
    if (!isProducer) {
      throw new Error("FORBIDDEN");
    }

    const shouldNotifyApproved = payload.approved && !row.proofOfContact;
    const excerpt = payload.approved ? payload.feedback?.trim() || "" : "";
    if (payload.approved && excerpt) {
      const { createApprovalStageComment } = await import("@/src/server/package-stage-comments");
      await createApprovalStageComment({
        rowId: row.id,
        stage: "brainstorming",
        authorId: userId,
        body: excerpt
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.packageProgressRow.update({
        where: { id: row.id },
        data: { proofOfContact: payload.approved },
        include: {
          members: {
            select: {
              userId: true,
              user: { select: { id: true, name: true, nickname: true, email: true } }
            }
          },
          assignedProducer: { select: { id: true, name: true, nickname: true, email: true } },
          proofOfContacts: {
            select: { id: true, slot: true, fileName: true, mimeType: true }
          }
        }
      });
      if (shouldNotifyApproved) {
        await recordAssociateReviewHistory({ rowId: row.id, stage: "brainstorming", kind: "review", actorId: userId, note: excerpt }, tx);
      }
      return updated;
    });

    if (shouldNotifyApproved) {
      const { notifyCheckInApproved } = await import("@/src/server/package-review-notify");
      void notifyCheckInApproved({
        progressRowId: row.id,
        stage: "brainstorming",
        reviewerName: userDisplayName(user) || user.email || "A producer",
        excludeUserId: userId,
        excerpt
      }).catch((error) => console.error("notifyCheckInApproved failed", error));
    }

    return ok({ package: serializeBrainstormPackage(updated) });
  } catch (error) {
    return handleRouteError(error);
  }
}
