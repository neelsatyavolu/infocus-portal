import type { PlatformRole } from "@prisma/client";
import { producerMayActOnPackage } from "@/src/lib/package-producer-assignment";
import { prisma } from "@/src/lib/prisma";

async function requireNotesAccess(rowId: string, userId: string, role: PlatformRole | null) {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: rowId },
    select: { possibleIdeas: true, assignedProducerUserId: true, members: { select: { userId: true } } }
  });
  if (!row) throw new Error("NOT_FOUND");
  if (!producerMayActOnPackage(role, userId, row)) throw new Error("FORBIDDEN");
  return row;
}

export async function loadGroupRosterNotes(rowId: string, userId: string, role: PlatformRole | null) {
  const row = await requireNotesAccess(rowId, userId, role);
  return { possibleIdeas: row.possibleIdeas };
}

export async function saveGroupRosterNotes(rowId: string, userId: string, role: PlatformRole | null, possibleIdeas: string) {
  await requireNotesAccess(rowId, userId, role);
  return prisma.packageProgressRow.update({
    where: { id: rowId },
    data: { possibleIdeas },
    select: { possibleIdeas: true }
  });
}
