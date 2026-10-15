import type { PlatformRole } from "@prisma/client";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { loadLivestreamsPayload } from "@/src/server/livestreams-payload";
import { asApiJson } from "@/src/server/as-api-json";
import LivestreamsClient from "./livestreams-client";
import type { Payload } from "./livestreams-model";

export const metadata: Metadata = { title: "Livestream Tracker" };

/** Same payload as GET /api/livestreams, so first paint matches the API. */
async function loadInitialPayload(user: { id: string }, role: PlatformRole | null): Promise<Payload | null> {
  try {
    // Display names and a JSON round trip, so the props match the API response exactly.
    return asApiJson(await loadLivestreamsPayload(user, role));
  } catch (error) {
    unstable_rethrow(error);
    // The client fetches instead and shows the API's error message.
    console.error("Livestreams first-paint load failed", error);
    return null;
  }
}

export default async function LivestreamsPage() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);

  return <LivestreamsClient initialData={await loadInitialPayload(user, access.role)} />;
}
