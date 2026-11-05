import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { okUnmapped } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { mayGrantExtensions } from "@/src/server/extension-requests";
import { requireRealUserId } from "@/src/server/native-push-devices";
import { settleHarvestContest } from "@/src/server/thanksgiving-contest";
import { givePrize, loadPrizeChoosers, loadPrizeOptions } from "@/src/server/thanksgiving-prize";

const postSchema = z.object({ winnerId: z.string().min(1), rowId: z.string().min(1) });

async function viewer() {
  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  const access = await getPlatformAccess(user.email);
  return { userId, admin: mayGrantExtensions(access.role) };
}

/**
 * The Thanksgiving prize still to be given (src/server/thanksgiving-prize.ts): the winners who
 * pick a group (just the viewer, or all of them for an exec) and the Cycle 2 groups to pick from.
 */
export async function GET() {
  try {
    const { userId, admin } = await viewer();
    await settleHarvestContest();
    const choosers = await loadPrizeChoosers(userId, admin);
    return okUnmapped({ viewerId: userId, choosers, options: choosers.length > 0 ? await loadPrizeOptions() : [] });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** A winner (or an exec for them) gives the prize to a Cycle 2 group still working. */
export async function POST(request: Request) {
  try {
    const { admin } = await viewer();
    // Credited to whoever is really signed in, never to an account an admin is viewing as.
    const byUserId = await requireRealUserId();
    const parsed = postSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new Error("Pick a group to give the prize to.");
    return okUnmapped(await givePrize({ ...parsed.data, byUserId, admin }));
  } catch (error) {
    return handleRouteError(error);
  }
}
