import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { fail, ok } from "@/src/lib/http";
import { prisma } from "@/src/lib/prisma";
import { getWebPushPublicKey, isWebPushConfigured } from "@/src/lib/web-push";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512)
  })
});

const deleteSchema = z.object({
  endpoint: z.string().url().max(2048).optional()
});

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const count = await prisma.pushNotificationSubscription.count({
      where: {
        userId: user.id
      }
    });

    return ok({
      configured: isWebPushConfigured(),
      publicKey: getWebPushPublicKey(),
      subscriptionCount: count,
      subscribed: count > 0
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!isWebPushConfigured()) {
      return fail("Web push is not configured on the server.", 400);
    }

    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const payload = subscriptionSchema.parse(await request.json());

    await prisma.pushNotificationSubscription.upsert({
      where: {
        endpoint: payload.endpoint
      },
      update: {
        userId: user.id,
        p256dh: payload.keys.p256dh,
        auth: payload.keys.auth
      },
      create: {
        userId: user.id,
        endpoint: payload.endpoint,
        p256dh: payload.keys.p256dh,
        auth: payload.keys.auth
      }
    });

    await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      update: {
        browserEnabled: true
      },
      create: {
        userId: user.id,
        browserEnabled: true
      }
    });

    return ok({ subscribed: true }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const payload = deleteSchema.parse(await request.json().catch(() => ({})));

    if (payload.endpoint) {
      await prisma.pushNotificationSubscription.deleteMany({
        where: {
          userId: user.id,
          endpoint: payload.endpoint
        }
      });
    } else {
      await prisma.pushNotificationSubscription.deleteMany({
        where: {
          userId: user.id
        }
      });
    }

    const remaining = await prisma.pushNotificationSubscription.count({
      where: {
        userId: user.id
      }
    });

    if (remaining === 0) {
      await prisma.notificationPreference.upsert({
        where: { userId: user.id },
        update: {
          browserEnabled: false
        },
        create: {
          userId: user.id,
          browserEnabled: false
        }
      });
    }

    return ok({ subscribed: remaining > 0 });
  } catch (error) {
    return handleRouteError(error);
  }
}
