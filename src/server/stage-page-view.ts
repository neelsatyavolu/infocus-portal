import type { StageView } from "@/components/package-stages/types";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import type { CycleStageSlug } from "@/src/lib/package-cycle-gates";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { loadCycleStageView } from "@/src/server/package-cycle-stage";

/** Expected refusals: the client's own fetch then shows the same error the route gives. */
const QUIET_ERRORS = new Set(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"]);

/**
 * What GET /api/package-cycle/stage answers, for a stage page to hand StageWorkspace so the first
 * paint has the stage instead of fetching it after hydration. Same caller and checks as the
 * route. Never rejects: any failure resolves to null and the client fetches as before.
 */
export async function loadStagePageView(input: {
  slug: CycleStageSlug;
  rowId?: string;
  reviewStage?: 1 | 2 | 3;
}): Promise<StageView | null> {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const view = await loadCycleStageView({
      userId,
      role: getPlatformAccess(user.email).then((access) => access.role),
      email: user.email,
      slug: input.slug,
      rowId: input.rowId ?? null,
      cycleNumber: null,
      reviewStage: input.reviewStage ?? null
    });
    // The JSON the route sends (dates as strings), not RSC-serialized Date objects.
    return JSON.parse(JSON.stringify(view)) as StageView;
  } catch (error) {
    if (!(error instanceof Error && QUIET_ERRORS.has(error.message))) {
      console.error("loadStagePageView failed", error);
    }
    return null;
  }
}
