import { ZodError } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { limitByKey } from "@/src/lib/rate-limit";
import { userDisplayName } from "@/src/lib/user-display";
import { contentReportSchema, reportContent } from "@/src/server/content-reports";

const RATE = { max: 10, windowMs: 60 * 60 * 1000 };

/** Report a chat message or a stage feedback comment to the adviser and executive producers. */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    if (!limitByKey(`hub-chat:report:${userId}`, RATE).allowed) throw new Error("TOO_MANY_REQUESTS");
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    const input = contentReportSchema.parse(await request.json().catch(() => null));
    const name = userDisplayName(user, "A member");
    return ok(await reportContent({ userId, name, role: access.role }, input), 201);
  } catch (error) {
    if (error instanceof ZodError) return fail(error.issues[0]?.message ?? "Invalid report.", 400);
    return handleRouteError(error);
  }
}
