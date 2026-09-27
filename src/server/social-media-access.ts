import type { PlatformRole } from "@prisma/client";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

export async function isSocialMediaManager(userId: string) {
  return Boolean(await prisma.socialMediaManager.findUnique({
    where: { userId },
    select: { id: true }
  }));
}

/** The Instagram Post Maker (Managers → Social media): producers and appointed social media managers. */
export async function canUseStoryMaker(userId: string, role: PlatformRole | null) {
  if (hasPlatformRole(role, "ASSOCIATE_PRODUCER")) return true;
  return isSocialMediaManager(userId);
}
