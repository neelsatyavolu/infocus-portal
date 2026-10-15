import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PackageCategory } from "@prisma/client";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { canEditPackageCycle, hasPlatformRole, normalizeEmail } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { loadPackageProgressData } from "@/src/server/package-progress-data";
import GroupsClient, { type GroupsPayload } from "./groups-client";

export const metadata: Metadata = { title: "Groups" };

async function associateCategory(email: string | null): Promise<PackageCategory | null> {
  const assignment = await prisma.platformRoleAssignment.findUnique({
    where: { email: normalizeEmail(email) },
    select: { category: true }
  });
  return assignment?.category ?? null;
}

export default async function GroupsPage() {
  let initialData: GroupsPayload;
  try {
    const { platformRole, user } = await getCurrentAppUser();
    if (!hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")) {
      redirect("/access-denied");
    }

    // The roster and the associate's category don't depend on each other: load them together.
    const [data, producerCategory] = await Promise.all([
      loadPackageProgressData(),
      platformRole === "ASSOCIATE_PRODUCER" ? associateCategory(user.email) : Promise.resolve(null)
    ]);

    initialData = {
      canEdit: canEditPackageCycle(platformRole),
      producerCategory,
      platformRole,
      currentUserId: user.id,
      ...data
    };
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      redirect("/access-denied");
    }
    throw error;
  }

  return <GroupsClient initialData={initialData} />;
}
