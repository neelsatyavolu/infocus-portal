import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { wipeMonthAnchors } from "@/src/server/show-cast";

const schema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return fail("Invalid month. Use YYYY-MM.", 400);
    }

    return ok(await wipeMonthAnchors(parsed.data.month));
  } catch (error) {
    return handleRouteError(error);
  }
}
