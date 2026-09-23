import type { PackageCategory, PlatformRole } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { filterBrainstormRowsForViewer, serializeProofs } from "@/src/lib/package-brainstorm";
import { producerMayActOnPackage } from "@/src/lib/package-producer-assignment";
import { labeledUser } from "@/src/lib/user-display";

const rowInclude = {
  members: {
    select: {
      userId: true,
      user: { select: { id: true, name: true, nickname: true, email: true } }
    }
  },
  assignedProducer: {
    select: { id: true, name: true, nickname: true, email: true }
  },
  proofOfContacts: {
    select: { id: true, slot: true, fileName: true, mimeType: true }
  }
} as const;

export type BrainstormRowRecord = {
  id: string;
  cycleNumber: number;
  groupTopic: string;
  brainstormDocUrl: string;
  proofOfContact: boolean;
  assignedProducer: { id: string; name: string | null; nickname?: string | null; email: string | null } | null;
  members: Array<{
    userId: string;
    user: { id: string; name: string | null; nickname?: string | null; email: string | null };
  }>;
  proofOfContacts: Array<{ id: string; slot: number; fileName: string; mimeType: string }>;
};

export function serializeBrainstormPackage(row: BrainstormRowRecord) {
  return {
    id: row.id,
    cycleNumber: row.cycleNumber,
    groupTopic: row.groupTopic,
    brainstormDocUrl: row.brainstormDocUrl,
    proofOfContact: row.proofOfContact,
    assignedProducer: row.assignedProducer
      ? { userId: row.assignedProducer.id, ...labeledUser(row.assignedProducer) }
      : null,
    members: row.members.map((member) => ({
      userId: member.userId,
      ...labeledUser(member.user)
    })),
    proofs: serializeProofs(row.proofOfContacts)
  };
}

export async function loadBrainstormRowAccess(rowId: string, userId: string, email: string | null) {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: rowId },
    include: rowInclude
  });

  if (!row) {
    throw new Error("NOT_FOUND");
  }

  const access = await getPlatformAccess(email);
  const isMember = row.members.some((member) => member.userId === userId);
  const isProducer = producerMayActOnPackage(access.role, userId, row);

  return { row, isProducer, isMember, access };
}

export async function requireBrainstormViewer(rowId: string, userId: string, email: string | null) {
  const result = await loadBrainstormRowAccess(rowId, userId, email);
  if (!result.isMember && !hasPlatformRole(result.access.role, "ASSOCIATE_PRODUCER")) {
    throw new Error("FORBIDDEN");
  }
  return result;
}

export async function requireBrainstormMember(rowId: string, userId: string, email: string | null) {
  const result = await loadBrainstormRowAccess(rowId, userId, email);
  if (!result.isMember) {
    throw new Error("FORBIDDEN");
  }
  return result;
}

export async function loadStudentBrainstormPackages(
  userId: string,
  cycleNumber: number,
  viewer: {
    platformRole: PlatformRole | null;
    producerCategory: PackageCategory | null;
  }
) {
  const rows = await prisma.packageProgressRow.findMany({
    where: { cycleNumber, members: { some: { userId } } },
    orderBy: { rowOrder: "asc" },
    include: rowInclude
  });

  return filterBrainstormRowsForViewer(rows, {
    userId,
    platformRole: viewer.platformRole,
    producerCategory: viewer.producerCategory
  })
    .filter(
      (row) =>
        Boolean(row.groupTopic.trim()) ||
        row.members.length > 0 ||
        Boolean(row.assignedProducer) ||
        Boolean(row.assignedExecutiveProducerUserId) ||
        row.proofOfContact ||
        Boolean(row.brainstormDocUrl.trim()) ||
        row.proofOfContacts.length > 0
    )
    .map((row) => ({
      ...serializeBrainstormPackage(row),
      canEdit: row.members.some((member) => member.userId === userId)
    }));
}
