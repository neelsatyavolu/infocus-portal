import { z } from "zod";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { handleRouteError } from "@/src/lib/api-errors";
import { okUnmapped } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { seesBoard } from "@/src/lib/thanksgiving-board";
import { userDisplayName } from "@/src/lib/user-display";
import { mayGrantExtensions } from "@/src/server/extension-requests";
import { loadReviewRows, setReviewFlag } from "@/src/server/thanksgiving-review";

const reviewSchema = z.object({ userId: z.string().min(1).max(200), flagged: z.boolean() });

/**
 * Execs flag a Thanksgiving leaderboard account (off the board, can't win the contest) or clear it.
 * The review list shows everyone's totals, so while the board is dark only the super admin may.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!mayGrantExtensions(access.role) || !seesBoard(new Date(), access.role)) throw new Error("FORBIDDEN");
    const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new Error("BAD_REQUEST");
    await setReviewFlag(parsed.data.userId, parsed.data.flagged, userDisplayName(user, "an exec"));
    return okUnmapped({ review: await loadReviewRows() });
  } catch (error) {
    return handleRouteError(error);
  }
}
