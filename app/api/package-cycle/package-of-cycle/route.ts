import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { canGradeFinalCut } from "@/src/lib/package-final-cut-scores";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import {
  loadPackageOfCyclePanel,
  loadPackageOfCycleWinners,
  setPackageOfCycleVote
} from "@/src/server/package-of-cycle";

/** Winners for the Package Cycles page: released cycles for everyone, every cycle for executives. */
export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    return ok({
      viewerUserId: userId,
      // Producers can download any winner's certificate; members only their own.
      canDownloadAll: hasPlatformRole(access.role, "ASSOCIATE_PRODUCER"),
      // Executives release each cycle's winners to everyone from Cycle Dates.
      canRelease: canGradeFinalCut(access.role),
      winners: await loadPackageOfCycleWinners(access.role)
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

const bodySchema = z.object({
  rowId: z.string().min(1),
  vote: z.boolean()
});

/** A Final Cut grader votes for (or withdraws from) Package of the Cycle. */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const payload = bodySchema.parse(await request.json());
    await setPackageOfCycleVote({ rowId: payload.rowId, userId, role: access.role, vote: payload.vote });
    return ok(await loadPackageOfCyclePanel({ rowId: payload.rowId, userId, role: access.role }));
  } catch (error) {
    return handleRouteError(error);
  }
}
