import { unstable_rethrow } from "next/navigation";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { loadPaPage } from "@/src/server/pa-scripts";
import PaClient, { type PaResponse } from "./pa-client";

/**
 * Same data as GET /api/announcements/pa (the same loader, as the same person), so first paint
 * needs no round trip. The API's extra `timeLabel` is for the iPhone app; this page works it out.
 */
async function loadInitialPa(): Promise<PaResponse | null> {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    // JSON round trip so the props match the API response exactly (it sends names as stored).
    return JSON.parse(JSON.stringify(await loadPaPage({ userId: user.id, email: user.email }))) as PaResponse;
  } catch (error) {
    unstable_rethrow(error);
    // The client fetches instead and shows the API's error message.
    console.error("PA script first-paint load failed", error);
    return null;
  }
}

export default async function PaAnnouncementsPage() {
  return <PaClient initialData={await loadInitialPa()} />;
}
