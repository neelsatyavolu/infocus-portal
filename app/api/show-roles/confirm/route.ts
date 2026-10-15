import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { pacificDateKey } from "@/src/lib/meetings/schedule";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { DATE_KEY_PATTERN } from "@/src/lib/show-assignment";
import { userDisplayName } from "@/src/lib/user-display";
import { confirmShowRoles } from "@/src/server/show-roles-confirm";

const schema = z.object({
  date: z.string().regex(DATE_KEY_PATTERN)
});

/** Producer confirms a filmed show's roles are right; stops the show manager's reminder emails. */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }
    const payload = schema.parse(await request.json());
    if (payload.date > pacificDateKey(new Date())) {
      return fail("This show hasn't been filmed yet.", 400);
    }
    return ok(await confirmShowRoles(payload.date, userDisplayName(user)));
  } catch (error) {
    return handleRouteError(error);
  }
}
