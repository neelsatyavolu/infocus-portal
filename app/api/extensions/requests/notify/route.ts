import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { notifyGroupOfExtensionDecision } from "@/src/server/extension-grant-notify";
import { mayGrantExtensions } from "@/src/server/extension-requests";

const notifySchema = z.object({ requestId: z.string().min(1) });

/** Execs manually (re)send the decision email for a decided request. */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!mayGrantExtensions(access.role)) {
      throw new Error("FORBIDDEN");
    }

    const rate = limitByKey(getRequestKey(request, "extensions:notify"), {
      max: 20,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const payload = notifySchema.parse(await request.json());
    const result = await notifyGroupOfExtensionDecision(payload.requestId);
    if (!result) {
      throw new Error("Only approved or denied requests can be emailed.");
    }
    if (!result.configured) {
      throw new Error("No email was sent. Email isn't set up, or no group member has an email address.");
    }
    if (result.sent === 0) {
      throw new Error("The email failed to send. Try again.");
    }

    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
