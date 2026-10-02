import { handleRouteError } from "@/src/lib/api-errors";
import { isApnsConfigured } from "@/src/lib/apns";
import { mainAppOrigin } from "@/src/lib/hosts";
import { fail, ok } from "@/src/lib/http";
import { sendNativePushToUserIds } from "@/src/lib/native-push";
import { requireRealUserId } from "@/src/server/native-push-devices";

/** Settings → Mac app notifications → Test: notifies every Mac this person signed in on. */
export async function POST() {
  try {
    const userId = await requireRealUserId();
    if (!isApnsConfigured()) {
      return fail("Mac notifications are not set up on the server yet.", 400);
    }
    const result = await sendNativePushToUserIds([userId], {
      title: "InFocus Portal",
      body: "Mac notifications are working.",
      url: `${mainAppOrigin()}/settings`
    });
    if (result.sent === 0 && result.failed === 0) {
      return fail("No Mac is registered for notifications yet. Turn them on in the InFocus app first.", 400);
    }
    if (result.sent === 0) {
      return fail("Apple didn't accept the test notification. Try again in a minute.", 502);
    }
    return ok(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
