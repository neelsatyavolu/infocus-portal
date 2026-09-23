import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { sendTestNotificationEmail } from "@/src/lib/email";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);

    const preference = await prisma.notificationPreference.findUnique({
      where: { userId: user.id },
      select: {
        emailEnabled: true,
        notificationEmail: true
      }
    });

    const emailEnabled = preference?.emailEnabled ?? true;
    if (!emailEnabled) {
      return fail("Enable email notifications before sending a test email.", 400);
    }

    const recipientEmail = preference?.notificationEmail ?? user.email;
    if (!recipientEmail) {
      return fail("Set a notification email before sending a test email.", 400);
    }

    const requestUrl = new URL(request.url);
    const envBaseUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    const baseUrl = envBaseUrl || requestUrl.origin;
    const settingsUrl = `${baseUrl.replace(/\/+$/, "")}/settings`;

    const result = await sendTestNotificationEmail({
      recipients: [recipientEmail],
      settingsUrl,
      recipientName: userDisplayName(user) || user.name
    });

    if (!result.configured) {
      return fail("Email notifications are not configured on the server yet.", 400);
    }

    if (result.sent === 0) {
      return fail("Failed to send test email notification.", 500);
    }

    return ok({ sent: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
