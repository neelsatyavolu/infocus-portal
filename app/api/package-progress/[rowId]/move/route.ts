import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { canEditPackageCycle, getPlatformAccess } from "@/src/lib/platform-admin";
import { movePackageRow } from "@/src/server/package-row-move";
import { MAX_CYCLES_PER_SEMESTER } from "@/src/server/program-settings";

const payloadSchema = z
  .object({ cycleNumber: z.number().int().min(1).max(MAX_CYCLES_PER_SEMESTER) })
  .strict();
type Context = { params: Promise<{ rowId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { rowId } = await context.params;
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!canEditPackageCycle(access.role)) {
      throw new Error("FORBIDDEN");
    }

    const payload = payloadSchema.parse(await request.json());
    const result = await movePackageRow(rowId, payload.cycleNumber);

    if (!result.moved) {
      return fail(
        `Already in a Cycle ${payload.cycleNumber} group: ${result.conflictNames.join(", ")}.`,
        409
      );
    }

    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
