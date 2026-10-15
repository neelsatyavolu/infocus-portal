import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { listProducerMembers } from "@/src/server/member-notes";
import { asApiJson } from "@/src/server/as-api-json";
import MembersClient from "./members-client";
import type { MembersPayload } from "./member-notes-model";

export const metadata: Metadata = { title: "Members" };

/** Same data as GET /api/members, so first paint matches the API. */
async function loadInitialMembers(): Promise<MembersPayload | null> {
  try {
    // Display names and a JSON round trip, so the props match the API response exactly.
    return asApiJson(await listProducerMembers());
  } catch (error) {
    unstable_rethrow(error);
    // The client fetches instead and shows the API's error message.
    console.error("Members first-paint load failed", error);
    return null;
  }
}

export default async function MembersPage() {
  const { platformRole } = await getCurrentAppUser();
  if (!hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")) {
    redirect("/access-denied");
  }

  return <MembersClient initialData={await loadInitialMembers()} />;
}
