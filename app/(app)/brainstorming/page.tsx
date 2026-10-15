import type { Metadata } from "next";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import BrainstormingClient from "./brainstorming-client";

export const metadata: Metadata = { title: "Brainstorming" };

export default async function BrainstormingPage() {
  const userId = await requireUserId();
  await syncUserProfile(userId);

  return <BrainstormingClient />;
}
