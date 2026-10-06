import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { requirePublishingViewer } from "@/src/server/publishing-access";
import PublishingQueueClient from "./publishing-queue-client";

export const metadata: Metadata = { title: "Publishing Queue" };

/** Producers manage the queue; appointed website managers see it read-only. */
export default async function PublishingQueuePage() {
  const { userId, platformRole } = await getCurrentAppUser();
  try {
    await requirePublishingViewer(userId, platformRole);
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/access-denied");
    throw error;
  }
  return <PublishingQueueClient canEdit={hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")} />;
}
