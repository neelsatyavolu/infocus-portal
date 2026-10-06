import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StoryMaker } from "@/components/story-maker/story-maker";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { canUseStoryMaker } from "@/src/server/social-media-access";

export const metadata: Metadata = {
  title: "Instagram Post Maker"
};

/**
 * Managers → Social media. Producers and appointed social media managers; producers also manage the roster.
 * Photos are processed in the browser and never uploaded.
 */
export default async function SocialMediaManagerPage() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  if (!(await canUseStoryMaker(user.id, access.role))) redirect("/access-denied");
  return <StoryMaker canAppoint={hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")} />;
}
