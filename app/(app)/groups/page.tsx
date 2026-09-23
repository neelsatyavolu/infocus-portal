import { redirect } from "next/navigation";
import { PackageCategory } from "@prisma/client";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { canEditPackageCycle, hasPlatformRole, normalizeEmail } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { loadPackageProgressData } from "@/src/server/package-progress-data";
import GroupsClient, { type GroupsPayload } from "./groups-client";

export default async function GroupsPage() {
  try {
    const { platformRole, user } = await getCurrentAppUser();
    if (!hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")) {
      redirect("/access-denied");
    }

    const data = await loadPackageProgressData();

    let producerCategory: PackageCategory | null = null;
    if (platformRole === "ASSOCIATE_PRODUCER") {
      const assignment = await prisma.platformRoleAssignment.findUnique({
        where: { email: normalizeEmail(user.email) },
        select: { category: true }
      });
      producerCategory = assignment?.category ?? null;
    }

    const initialData: GroupsPayload = {
      canEdit: canEditPackageCycle(platformRole),
      producerCategory,
      platformRole,
      currentUserId: user.id,
      ...data
    };

    return <GroupsClient initialData={initialData} />;
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      redirect("/access-denied");
    }
    throw error;
  }
}
