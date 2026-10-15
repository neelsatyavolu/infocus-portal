import { unstable_rethrow } from "next/navigation";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { asApiJson } from "@/src/server/as-api-json";
import { loadPackageCycles } from "@/src/server/package-cycles-data";
import CycleDatesClient from "./cycle-dates-client";
import type { PackageCyclesResponse } from "./cycle-dates-utils";

/** Same data as GET /api/package-cycles, so first paint matches the API. */
async function loadInitialCycles(): Promise<PackageCyclesResponse | null> {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    // Display names and a JSON round trip, so the props match the API response exactly.
    return asApiJson(await loadPackageCycles(access.role));
  } catch (error) {
    unstable_rethrow(error);
    // The client fetches instead and shows the API's error message.
    console.error("Cycle Dates first-paint load failed", error);
    return null;
  }
}

export default async function PackageCyclesPage() {
  return <CycleDatesClient initialData={await loadInitialCycles()} />;
}
