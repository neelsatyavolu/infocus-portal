import type { Metadata } from "next";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { mayGrantExtensions } from "@/src/server/extension-requests";
import ExtensionRequestsClient from "./extension-requests-client";

export const metadata: Metadata = { title: "Extension Requests" };

export default async function ExtensionRequestsPage() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);

  // Students may open this page to file a request; the API scopes what they see. The viewer
  // flags only shape the layout before the list loads; every action still checks the payload.
  return (
    <ExtensionRequestsClient
      viewer={{
        isProducer: hasPlatformRole(access.role, "ASSOCIATE_PRODUCER"),
        canGrant: mayGrantExtensions(access.role)
      }}
    />
  );
}
