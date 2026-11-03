import { z } from "zod";
import { requireUserId } from "@/src/lib/auth";
import { handleRouteError } from "@/src/lib/api-errors";
import { okUnmapped } from "@/src/lib/http";
import { clampHarvest, HARVEST_CONTEST, MAX_CARRY_OVER } from "@/src/lib/thanksgiving-board";
import { requireRealUserId } from "@/src/server/native-push-devices";
import { loadHarvestContest, settleHarvestContest } from "@/src/server/thanksgiving-contest";
import { addHarvest, carryOverHarvest, loadHarvestBoard } from "@/src/server/thanksgiving-scores";

const countsSchema = z.record(z.string(), z.unknown()).optional();
const postSchema = z.object({ add: countsSchema, carryOver: countsSchema });

/** The Thanksgiving leaderboard, which row is the viewer's, and the contest (its close, then its winner). */
export async function GET() {
  try {
    const userId = await requireUserId();
    await settleHarvestContest();
    const [board, result] = await Promise.all([loadHarvestBoard(), loadHarvestContest()]);
    return okUnmapped({
      ...board,
      viewerId: userId,
      contest: { closesAt: HARVEST_CONTEST.closesAt.toISOString(), prizeDays: HARVEST_CONTEST.prizeDays, result }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * A browser's batch of catches (`add`), or the leaves and pies it counted before the board
 * existed (`carryOver`, once per browser). Credited to whoever is really signed in, never to an
 * account an admin is viewing as.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireRealUserId();
    const parsed = postSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new Error("That catch couldn't be counted.");
    const { add, carryOver } = parsed.data;
    // Lock in the contest before anything after its close is counted.
    await settleHarvestContest();
    if (carryOver) await carryOverHarvest(userId, clampHarvest({ leaves: carryOver.leaves, pies: carryOver.pies }, MAX_CARRY_OVER));
    if (add) await addHarvest(userId, clampHarvest(add));
    return okUnmapped({ saved: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
