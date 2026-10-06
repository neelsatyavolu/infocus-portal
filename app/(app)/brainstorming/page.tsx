import type { Metadata } from "next";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import BrainstormingClient from "./brainstorming-client";

export const metadata: Metadata = { title: "Brainstorming" };

export default async function BrainstormingPage() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  await getPlatformAccess(user.email);

  return <BrainstormingClient />;
}
