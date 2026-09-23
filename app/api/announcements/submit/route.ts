import { ZodError } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { fail, ok } from "@/src/lib/http";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import {
  createAnnouncementSubmission,
  parseAnnouncementSubmitPayload
} from "@/src/server/announcement-submissions";

export async function POST(request: Request) {
  try {
    const rate = limitByKey(getRequestKey(request, "announcements:submit"), { max: 8, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const created = await createAnnouncementSubmission(parseAnnouncementSubmitPayload(await request.json()));
    return ok(created, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(error.issues[0]?.message ?? "Invalid announcement.", 400, error.issues);
    }

    return handleRouteError(error);
  }
}
