import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { setPackageOfCycleRelease } from "@/src/server/package-of-cycle";

const bodySchema = z.object({
  cycleNumber: z.number().int().min(1).max(100),
  released: z.boolean()
});

/** An executive releases a cycle's Package of the Cycle winners to everyone (or takes them back). */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const payload = bodySchema.parse(await request.json());
    await setPackageOfCycleRelease({ ...payload, role: access.role });
    return ok({ cycleNumber: payload.cycleNumber, released: payload.released });
  } catch (error) {
    return handleRouteError(error);
  }
}
