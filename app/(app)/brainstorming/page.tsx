import type { Metadata } from "next";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { loadBrainstormingPayload } from "@/src/server/brainstorming-payload";
import { MAX_CYCLES_PER_SEMESTER } from "@/src/server/program-settings";
import BrainstormingClient from "./brainstorming-client";
import { parseCycleParam, type BrainstormPayload } from "./brainstorm-view";

export const metadata: Metadata = { title: "Brainstorming" };

/**
 * GET /api/brainstorming's answer for this URL, so the first paint has the packages. Never
 * rejects: a cycle the route would refuse, or any failure, gives null and the client fetches
 * (and shows the route's error) as before.
 */
async function loadInitialPayload(
  userId: string,
  email: string | null,
  cycle: number | null
): Promise<BrainstormPayload | null> {
  if (cycle !== null && cycle > MAX_CYCLES_PER_SEMESTER) return null;
  try {
    const payload = await loadBrainstormingPayload({ userId, email, requestedCycleNumber: cycle });
    // The JSON the route sends, not RSC-serialized objects.
    return JSON.parse(JSON.stringify(payload)) as BrainstormPayload;
  } catch (error) {
    console.error("brainstorming page load failed", error);
    return null;
  }
}

export default async function BrainstormingPage({
  searchParams
}: {
  searchParams: Promise<{ cycle?: string | string[] }>;
}) {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const { cycle } = await searchParams;
  // The client reads ?cycle the same way (useSearchParams().get keeps the first value).
  const urlCycle = parseCycleParam(Array.isArray(cycle) ? cycle[0] : cycle);

  // Not awaited: the payload streams in, and the client waits for it only with no copy to show.
  return (
    <BrainstormingClient
      initial={{ cycle: urlCycle, payload: loadInitialPayload(userId, user.email, urlCycle) }}
    />
  );
}
