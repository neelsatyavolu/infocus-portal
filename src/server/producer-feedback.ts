import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";
import { getCanonicalWorkspaceId } from "@/src/lib/canonical-workspace";
import { PRODUCER_FEEDBACK_ACTION, producerFeedbackSchema, savedProducerFeedbackSchema, type GroupProducerFeedback, type ProducerFeedbackGroup } from "@/src/lib/producer-feedback";

function reviewId(rowId: string, producerId: string) {
  return `producer-feedback:${rowId}:${producerId}`;
}

/** Only the executive-only Associates loader calls this; never expose content on the student endpoint. */
export async function loadProducerFeedback(cycleNumber: number): Promise<GroupProducerFeedback[]> {
  const entries = await prisma.auditLog.findMany({
    where: { action: PRODUCER_FEEDBACK_ACTION, targetType: "ProducerFeedback", metadata: { path: ["cycleNumber"], equals: cycleNumber } },
    select: { targetId: true, metadata: true, createdAt: true }, orderBy: { createdAt: "desc" }
  });
  return entries.flatMap((entry) => {
    const parsed = savedProducerFeedbackSchema.safeParse(entry.metadata);
    return parsed.success ? [{ ...parsed.data, rowId: entry.targetId, updatedAt: entry.createdAt.toISOString() }] : [];
  });
}

export async function loadProducerFeedbackGroups(userId: string): Promise<ProducerFeedbackGroup[]> {
  const rows = await prisma.packageProgressRow.findMany({
    where: { cycleNumber: { gt: 0 }, members: { some: { userId } } },
    orderBy: [{ cycleNumber: "desc" }, { rowOrder: "asc" }],
    select: { id: true, cycleNumber: true, groupTopic: true, assignedProducerUserId: true,
      assignedProducer: { select: { name: true, nickname: true, email: true } } }
  });
  const records = await prisma.auditLog.findMany({
    where: { id: { in: rows.filter((r) => r.assignedProducerUserId).map((r) => reviewId(r.id, r.assignedProducerUserId!)) }, action: PRODUCER_FEEDBACK_ACTION },
    select: { id: true }
  });
  const submitted = new Set(records.map((r) => r.id));
  return rows.map((row) => ({
    rowId: row.id, cycleNumber: row.cycleNumber, topic: row.groupTopic || "Untitled group",
    producerName: row.assignedProducer ? userDisplayName(row.assignedProducer, "Associate producer") : null,
    submitted: !!row.assignedProducerUserId && submitted.has(reviewId(row.id, row.assignedProducerUserId))
  }));
}

export async function saveProducerFeedback(userId: string, rowId: string, input: unknown) {
  const review = producerFeedbackSchema.parse(input);
  // Check membership again inside the write transaction; role alone never grants submission rights.
  const workspaceId = await getCanonicalWorkspaceId();
  await prisma.$transaction(async (tx) => {
    const row = await tx.packageProgressRow.findFirst({
      where: { id: rowId, cycleNumber: { gt: 0 }, members: { some: { userId } } },
      select: { id: true, cycleNumber: true, groupTopic: true, assignedProducerUserId: true }
    });
    if (!row || row.assignedProducerUserId === userId) throw new Error("FORBIDDEN");
    if (!row.assignedProducerUserId) throw new Error("No associate producer is assigned to this group.");
    const metadata = { ...review, cycleNumber: row.cycleNumber, producerId: row.assignedProducerUserId, groupTopic: row.groupTopic || "Untitled group" };
    await tx.auditLog.upsert({
      where: { id: reviewId(row.id, row.assignedProducerUserId) },
      create: { id: reviewId(row.id, row.assignedProducerUserId), workspaceId, action: PRODUCER_FEEDBACK_ACTION,
        targetType: "ProducerFeedback", targetId: row.id, actorId: null, metadata },
      update: { metadata, createdAt: new Date(), actorId: null }
    });
  });
}
