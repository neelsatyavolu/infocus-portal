import { redirect } from "next/navigation";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { canManageEquipment } from "@/src/server/equipment-access";
import EquipmentManageClient from "../manage-client";

export default async function EquipmentManagePage() {
  let userId: string | null = null;
  try {
    userId = await requireUserId();
  } catch {
    userId = null;
  }

  if (!userId) {
    redirect("/sign-in?returnTo=/equipment/manage" as never);
  }

  let user;
  try {
    user = await syncUserProfile(userId);
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      redirect("/access-denied" as never);
    }
    throw error;
  }

  const access = await getPlatformAccess(user.email);
  if (!(await canManageEquipment(user.id, access.role))) {
    redirect("/access-denied" as never);
  }

  return <EquipmentManageClient />;
}
