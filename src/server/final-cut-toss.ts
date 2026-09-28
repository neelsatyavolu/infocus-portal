import type { PlatformRole } from "@prisma/client";
import { producerMayActOnPackage } from "@/src/lib/package-producer-assignment";
import { normalizeToss } from "@/src/lib/package-toss";
import { prisma } from "@/src/lib/prisma";

/** Group members (and producers who can act on the package) can add or change the toss after upload. */
export async function saveFinalCutToss(input: {
  rowId: string;
  userId: string;
  role: PlatformRole | null;
  toss: string;
}) {
  const row = await prisma.packageProgressRow.findUnique({
    where: { id: input.rowId },
    select: {
      finalCutMediaItemId: true,
      assignedProducerUserId: true,
      members: { select: { userId: true } }
    }
  });
  if (!row) throw new Error("NOT_FOUND");
  const isMember = row.members.some((member) => member.userId === input.userId);
  if (!isMember && !producerMayActOnPackage(input.role, input.userId, row)) throw new Error("FORBIDDEN");
  if (!row.finalCutMediaItemId) throw new Error("CONFLICT");

  await prisma.packageProgressRow.update({
    where: { id: input.rowId },
    data: { finalCutToss: normalizeToss(input.toss) }
  });
}
