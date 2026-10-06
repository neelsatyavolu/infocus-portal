import type { Metadata } from "next";
import { redirect } from "next/navigation";
import MeetingsClient from "@/components/meetings/tab/meetings-client";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { hasPlatformRole } from "@/src/lib/platform-admin";

export const metadata: Metadata = { title: "Meetings" };

export default async function MeetingsPage() {
  const { platformRole } = await getCurrentAppUser();
  if (!hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")) {
    redirect("/access-denied");
  }

  return <MeetingsClient />;
}
