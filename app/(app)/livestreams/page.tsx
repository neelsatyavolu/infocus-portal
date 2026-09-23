import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import LivestreamsClient from "./livestreams-client";

export default async function LivestreamsPage() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  await getPlatformAccess(user.email);

  return <LivestreamsClient />;
}
