import { z } from "zod";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess, hasPlatformRole, isExecutiveProducer } from "@/src/lib/platform-admin";
import { handleRouteError } from "@/src/lib/api-errors";
import { ok } from "@/src/lib/http";
import { loadAssociatePerformance } from "@/src/server/associate-performance";
import { MAX_CYCLES_PER_SEMESTER } from "@/src/server/program-settings";

export async function GET(request: Request) {
  try {
    const user = await syncUserProfile(await requireUserId());
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "EXECUTIVE_PRODUCER")) throw new Error("FORBIDDEN");
    const cycle = z.coerce.number().int().min(1).max(MAX_CYCLES_PER_SEMESTER)
      .parse(new URL(request.url).searchParams.get("cycle"));
    return ok(await loadAssociatePerformance(cycle, { includeGroupFeedback: isExecutiveProducer(access.role) }));
  } catch (error) {
    return handleRouteError(error);
  }
}


/** Evaluates only the selected associate; a normal GET never spends provider quota. */
export async function POST(request: Request) {
  try {
    const user = await syncUserProfile(await requireUserId());
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "EXECUTIVE_PRODUCER")) throw new Error("FORBIDDEN");
    const payload = z.object({ cycle: z.number().int().min(1).max(MAX_CYCLES_PER_SEMESTER), userId: z.string().min(1) }).parse(await request.json());
    const data = await loadAssociatePerformance(payload.cycle, { evaluateUserId: payload.userId, includeGroupFeedback: isExecutiveProducer(access.role) });
    const associate = data.associates.find((a) => a.userId === payload.userId);
    if (!associate) throw new Error("NOT_FOUND");
    return ok({ associate });
  } catch (error) { return handleRouteError(error); }
}
