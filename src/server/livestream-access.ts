import type { PlatformRole } from "@prisma/client";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

export async function isLivestreamManager(userId: string) {
  const row = await prisma.livestreamManager.findUnique({
    where: { userId },
    select: { id: true }
  });
  return Boolean(row);
}

/** Producers (associate+) or appointed livestream managers may edit the tracker. */
export async function canManageLivestreams(userId: string, platformRole: PlatformRole | null) {
  if (hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")) {
    return true;
  }
  return isLivestreamManager(userId);
}

export async function requireLivestreamManagerAccess(userId: string, platformRole: PlatformRole | null) {
  if (!(await canManageLivestreams(userId, platformRole))) {
    throw new Error("FORBIDDEN");
  }
}

/** Only platform producers appoint managers. */
export function canAppointLivestreamManagers(platformRole: PlatformRole | null) {
  return hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER");
}
