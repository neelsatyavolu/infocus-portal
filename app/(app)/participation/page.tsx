import { redirect } from "next/navigation";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import ParticipationClient from "./participation-client";

export default async function ParticipationPage() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);

  if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
    redirect("/dashboard");
  }

  return <ParticipationClient />;
}
