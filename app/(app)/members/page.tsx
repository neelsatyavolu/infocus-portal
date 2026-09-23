import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import MembersClient from "./members-client";

export default async function MembersPage() {
  const { platformRole } = await getCurrentAppUser();
  if (!hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")) {
    redirect("/access-denied");
  }

  return <MembersClient />;
}
