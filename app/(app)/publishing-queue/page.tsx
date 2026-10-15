import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { requirePublishingViewer } from "@/src/server/publishing-access";
import { loadPublishingQueue } from "@/src/server/publishing-queue-data";
import { asApiJson } from "@/src/server/as-api-json";
import PublishingQueueClient from "./publishing-queue-client";
import type { QueueData } from "./queue-types";

export const metadata: Metadata = { title: "Publishing Queue" };

/** Same data as GET /api/package-cycle/queue (no candidates), so first paint matches the API. */
async function loadInitialQueue(canEdit: boolean): Promise<QueueData | null> {
  try {
    // Display names and a JSON round trip, so the props match the API response exactly.
    return asApiJson(await loadPublishingQueue({ canEdit, wantCandidates: false }));
  } catch (error) {
    unstable_rethrow(error);
    // The client fetches instead and shows the API's error message.
    console.error("Publishing Queue first-paint load failed", error);
    return null;
  }
}

/** Producers manage the queue; appointed website managers see it read-only. */
export default async function PublishingQueuePage() {
  const { userId, platformRole } = await getCurrentAppUser();
  try {
    await requirePublishingViewer(userId, platformRole);
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") redirect("/access-denied");
    throw error;
  }
  const canEdit = hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER");
  return <PublishingQueueClient canEdit={canEdit} initialData={await loadInitialQueue(canEdit)} />;
}
