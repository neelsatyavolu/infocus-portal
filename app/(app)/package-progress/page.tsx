import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { canEditPackageCycle, hasPlatformRole } from "@/src/lib/platform-admin";
import { loadPackageProgressData } from "@/src/server/package-progress-data";
import PackageProgressClient, { type PackageProgressPayload } from "./package-progress-client";

export default async function PackageProgressPage() {
  try {
    const { platformRole } = await getCurrentAppUser();
    if (!hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")) {
      redirect("/access-denied");
    }

    const data = await loadPackageProgressData();
    const initialData: PackageProgressPayload = {
      canEdit: canEditPackageCycle(platformRole),
      canAssignProducer: canEditPackageCycle(platformRole),
      ...data,
      rows: data.rows
    };

    return <PackageProgressClient initialData={initialData} />;
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      redirect("/access-denied");
    }

    throw error;
  }
}
