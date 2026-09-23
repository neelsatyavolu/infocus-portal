import type { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { getCanonicalWorkspaceId } from "@/src/lib/canonical-workspace";

export const ASSOCIATE_REVIEW_AUDIT = "associate.review";

/** Keep attribution even when the approval chain clears its mutable signoffs. */
export async function recordAssociateReviewHistory(
  input: { rowId: string; stage: string; kind: "ready" | "review"; actorId?: string; note?: string; mediaVersionId?: string },
  db: Prisma.TransactionClient = prisma
) {
  const row = await db.packageProgressRow.findUnique({
    where: { id: input.rowId },
    select: { cycleNumber: true, assignedProducerUserId: true, project: { select: { workspaceId: true } } }
  });
  if (!row) throw new Error("NOT_FOUND");
  await db.auditLog.create({
    data: {
      workspaceId: row.project?.workspaceId ?? await getCanonicalWorkspaceId(),
      actorId: input.actorId,
      action: ASSOCIATE_REVIEW_AUDIT,
      targetType: "PackageProgressRow",
      targetId: input.rowId,
      metadata: {
        stage: input.stage, kind: input.kind, cycleNumber: row.cycleNumber,
        assignedProducerUserId: row.assignedProducerUserId, mediaVersionId: input.mediaVersionId ?? null, note: input.note ?? ""
      }
    }
  });
}
