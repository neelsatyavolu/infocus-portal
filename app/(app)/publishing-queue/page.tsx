import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import PublishingQueueClient from "./publishing-queue-client";

export default async function PublishingQueuePage() {
  const { platformRole } = await getCurrentAppUser();
  if (!hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")) {
    redirect("/access-denied");
  }
  return <PublishingQueueClient />;
}
