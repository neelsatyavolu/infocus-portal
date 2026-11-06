import { z } from "zod";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { handleRouteError } from "@/src/lib/api-errors";
import { okUnmapped } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { contestPhase, HARVEST_CONTEST, HARVEST_KINDS, seesBoard, viewerPoints } from "@/src/lib/thanksgiving-board";
import { MAX_CATCHES_PER_BATCH } from "@/src/lib/thanksgiving-guard";
import { mayGrantExtensions } from "@/src/server/extension-requests";
import { requireRealUserId } from "@/src/server/native-push-devices";
import { loadHarvestContest, settleHarvestContest } from "@/src/server/thanksgiving-contest";
import { loadReviewRows } from "@/src/server/thanksgiving-review";
import {
  carryOverHarvest,
  loadHarvestBoard,
  recordCatches,
  rejectOutdatedBatch
} from "@/src/server/thanksgiving-scores";

const catchSchema = z.object({
  kind: z.enum(HARVEST_KINDS),
  at: z.number().finite(),
  age: z.number().finite().nullable()
});

const postSchema = z.object({
  /** Each catch with when it happened and how long its visitor had been on screen (harvest-tally.ts). */
  catches: z.array(catchSchema).max(MAX_CATCHES_PER_BATCH).optional(),
  /** The browser's clock when it sent the batch, to line its times up with the server's. */
  sentAt: z.number().finite().optional(),
  /** `navigator.webdriver`: the browser is driven by automation. */
  automation: z.boolean().optional(),
  carryOver: z.object({ leaves: z.number().finite(), pies: z.number().finite() }).optional(),
  /** Bare counts from a page loaded before the cheat checks: logged, never counted. */
  add: z.record(z.string(), z.unknown()).optional()
});

/** Far more than one person's browsers send (one batch every few seconds). */
const POSTS_PER_MINUTE = 30;

/**
 * The Thanksgiving leaderboard, which row is the viewer's, their points, and the contest (its
 * close, then its winner once revealed). While the board is dark (until the reveal) everyone but
 * the super admin gets no rows (`hidden`), only their own points. Execs also get the review list,
 * but only while the board is public.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const admin = mayGrantExtensions(access.role);
    const now = new Date();
    await settleHarvestContest(now);
    const [board, result] = await Promise.all([loadHarvestBoard(now), loadHarvestContest()]);
    const hidden = !seesBoard(now, access.role);
    return okUnmapped({
      ...board,
      ...(hidden ? { rows: [], disqualified: [] } : {}),
      hidden,
      viewerId: userId,
      viewerTotal: viewerPoints(board, userId),
      contest: {
        closesAt: HARVEST_CONTEST.closesAt.toISOString(),
        prizeDays: HARVEST_CONTEST.prizeDays,
        phase: contestPhase(now),
        result
      },
      review: admin && !hidden ? await loadReviewRows() : null
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * A browser's batch of catches, judged and logged one by one (src/lib/thanksgiving-guard.ts), or
 * the leaves and pies it counted before the board existed (`carryOver`, once per person, capped).
 * Credited to whoever is really signed in, never to an account an admin is viewing as.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireRealUserId();
    const rate = limitByKey(getRequestKey(request, `thanksgiving:${userId}`), { max: POSTS_PER_MINUTE, windowMs: 60_000 });
    if (!rate.allowed) throw new Error("TOO_MANY_REQUESTS");
    const parsed = postSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new Error("That catch couldn't be counted.");
    const { catches, sentAt, automation, carryOver, add } = parsed.data;
    // Lock in the contest before anything after its close is counted.
    await settleHarvestContest();
    if (add) await rejectOutdatedBatch(userId, add as Record<string, number>);
    if (carryOver) await carryOverHarvest(userId, carryOver);
    const recorded = catches?.length
      ? await recordCatches(userId, { catches, sentAt: sentAt ?? Date.now(), automation: automation === true })
      : { accepted: 0, rejected: 0 };
    return okUnmapped(recorded);
  } catch (error) {
    return handleRouteError(error);
  }
}
