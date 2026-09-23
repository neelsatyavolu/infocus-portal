import type { PlatformRole } from "@prisma/client";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";

export function canManageEquipmentWithAppointment(platformRole: PlatformRole | null, appointed: boolean) {
  return hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER") || appointed;
}

export function canAppointEquipmentManagers(platformRole: PlatformRole | null) {
  return hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER");
}

export async function isEquipmentManager(userId: string) {
  const row = await prisma.equipmentManager.findUnique({
    where: { userId },
    select: { id: true }
  });
  return Boolean(row);
}

export async function canManageEquipment(userId: string, platformRole: PlatformRole | null) {
  if (hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")) {
    return true;
  }
  return isEquipmentManager(userId);
}

export async function requireEquipmentManagerAccess(userId: string, platformRole: PlatformRole | null) {
  if (!(await canManageEquipment(userId, platformRole))) {
    throw new Error("FORBIDDEN");
  }
}
