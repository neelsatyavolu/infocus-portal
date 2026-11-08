import { syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { producerMayActOnPackage } from "@/src/lib/package-producer-assignment";
import { prisma } from "@/src/lib/prisma";

/**
 * A package-cycle Initial or Final Cut is replaced through /api/package-cycle/upload, which applies
 * the stage gates. Everywhere else, only someone who may act as producer on that package (never an
 * associate on its own roster) may add, finish, or move a version onto it.
 */
export async function assertMayChangeCycleCut(userId: string, mediaItemId: string) {
  const rows = await prisma.packageProgressRow.findMany({
    where: { OR: [{ initialCutMediaItemId: mediaItemId }, { finalCutMediaItemId: mediaItemId }] },
    select: { assignedProducerUserId: true, members: { select: { userId: true } } }
  });
  if (rows.length === 0) return;
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  if (!rows.every((row) => producerMayActOnPackage(access.role, userId, row))) {
    throw new Error("FORBIDDEN");
  }
}
