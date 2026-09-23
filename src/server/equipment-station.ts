import { parseStationToken } from "@/src/lib/equipment-kiosk";
import { prisma } from "@/src/lib/prisma";
import { getPlatformAccess, isEmailAllowedToUsePlatform } from "@/src/lib/platform-admin";
import { requireEquipmentManagerAccess } from "@/src/server/equipment-access";

export async function requireEquipmentStationManager(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
  if (!user || !(await isEmailAllowedToUsePlatform(user.email))) throw new Error("FORBIDDEN");
  const access = await getPlatformAccess(user.email);
  await requireEquipmentManagerAccess(user.id, access.role);
  return user;
}

export async function requireEquipmentStation(token?: string) {
  const session = parseStationToken(token);
  if (!session) throw new Error("UNAUTHORIZED");
  const user = await requireEquipmentStationManager(session.userId);
  if (session.expiresAt <= Date.now()) throw new Error("UNAUTHORIZED");
  return { ...session, name: user.name };
}
