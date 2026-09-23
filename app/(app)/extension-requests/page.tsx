import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import ExtensionRequestsClient from "./extension-requests-client";

export default async function ExtensionRequestsPage() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  await getPlatformAccess(user.email);

  // Students may open this page to file a request; the API scopes what they see.
  return <ExtensionRequestsClient />;
}
