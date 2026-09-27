import type { ManagerRosters } from "@/src/lib/managers";
import { prisma } from "@/src/lib/prisma";

const query = { select: { userId: true, user: { select: { name: true, nickname: true } } }, orderBy: { createdAt: "asc" } } as const;

type Row = { userId: string; user: { name: string | null; nickname: string | null } };
/** Nickname, then name. Never the email: these names are shown to every member. */
const toPerson = (row: Row) => ({ userId: row.userId, name: row.user.nickname?.trim() || row.user.name?.trim() || "A member" });

/** Every appointed-manager roster, for the Managers tab. Producers aren't listed; they can open every tool. */
export async function loadManagerRosters(): Promise<ManagerRosters> {
  const [equipment, livestreams, website, socialMedia] = await Promise.all([
    prisma.equipmentManager.findMany(query),
    prisma.livestreamManager.findMany(query),
    prisma.publishingManager.findMany(query),
    prisma.socialMediaManager.findMany(query)
  ]);
  return {
    equipment: equipment.map(toPerson),
    livestreams: livestreams.map(toPerson),
    website: website.map(toPerson),
    "social-media": socialMedia.map(toPerson)
  };
}
