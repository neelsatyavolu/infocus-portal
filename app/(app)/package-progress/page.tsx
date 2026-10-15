import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { canEditPackageCycle, hasPlatformRole } from "@/src/lib/platform-admin";
import { loadPackageProgressData } from "@/src/server/package-progress-data";
import PackageProgressClient, { type PackageProgressPayload } from "./package-progress-client";

export const metadata: Metadata = { title: "Package Cycle" };

/** This request's clock, read once on the server after the data loads. */
function requestTime() {
  return Date.now();
}

export default async function PackageProgressPage() {
  let viewerUserId: string;
  let initialData: PackageProgressPayload;
  let renderedAt: number;
  try {
    const { userId, platformRole } = await getCurrentAppUser();
    viewerUserId = userId;
    if (!hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")) {
      redirect("/access-denied");
    }

    const data = await loadPackageProgressData();
    initialData = {
      canEdit: canEditPackageCycle(platformRole),
      canAssignProducer: canEditPackageCycle(platformRole),
      ...data,
      rows: data.rows
    };

    // The client's first render uses this clock too, so time-based statuses hydrate unchanged.
    renderedAt = requestTime();
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      redirect("/access-denied");
    }

    throw error;
  }

  return <PackageProgressClient initialData={initialData} viewerUserId={viewerUserId} renderedAt={renderedAt} />;
}
