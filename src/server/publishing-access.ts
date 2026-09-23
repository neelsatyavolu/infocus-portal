import type { PlatformRole } from "@prisma/client";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

export async function isPublishingManager(userId: string) {
  return Boolean(await prisma.publishingManager.findUnique({
    where: { userId },
    select: { id: true }
  }));
}

/** Appointment grants publication viewing only, never queue or group editing. */
export async function requirePublishingViewer(userId: string, role: PlatformRole | null) {
  if (hasPlatformRole(role, "ASSOCIATE_PRODUCER")) return;
  if (!(await isPublishingManager(userId))) throw new Error("FORBIDDEN");
}
