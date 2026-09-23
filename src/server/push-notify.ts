import { isWebPushConfigured, sendWebPush } from "@/src/lib/web-push";
import { prisma } from "@/src/lib/prisma";

export type PushCategory = "browser" | "comments" | "grades";

export async function sendPushToUserIds(
  userIds: string[],
  payload: { title: string; body: string; url: string },
  category: PushCategory = "browser"
) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0 || !isWebPushConfigured()) {
    return { sent: 0, failed: 0 };
  }

  const preferenceFilter =
    category === "comments"
      ? { browserEnabled: true, browserCommentsEnabled: true }
      : category === "grades"
        ? { browserEnabled: true, browserGradesEnabled: true }
        : { browserEnabled: true };

  const subscriptions = await prisma.pushNotificationSubscription.findMany({
    where: {
      userId: { in: uniqueIds },
      user: { notificationPreference: preferenceFilter }
    },
    select: { id: true, endpoint: true, p256dh: true, auth: true }
  });

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const results = await Promise.all(
    subscriptions.map((subscription) =>
      sendWebPush(
        {
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth
        },
        payload
      ).then((result) => ({ id: subscription.id, result }))
    )
  );

  const staleIds = results.filter((entry) => entry.result.stale).map((entry) => entry.id);
  if (staleIds.length > 0) {
    await prisma.pushNotificationSubscription.deleteMany({ where: { id: { in: staleIds } } });
  }

  const sent = results.filter((entry) => entry.result.ok).length;
  return { sent, failed: results.length - sent };
}
