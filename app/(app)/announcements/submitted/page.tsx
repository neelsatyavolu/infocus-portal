import { unstable_rethrow } from "next/navigation";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import SubmittedAnnouncementsClient from "./submitted-announcements-client";

// Metadata lives in ./layout.tsx.

/** Same check /api/platform/me reports as `isExecutiveProducer`; any failure hides the invite button. */
async function loadCanInvite() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    return access.isExecutiveProducer;
  } catch (error) {
    unstable_rethrow(error); // never swallow Next's dynamic-rendering signals
    return false;
  }
}

export default async function SubmittedAnnouncementsPage() {
  return <SubmittedAnnouncementsClient canInvite={await loadCanInvite()} />;
}
