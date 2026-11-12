import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  pushNotificationSubscription: { findMany: vi.fn(), deleteMany: vi.fn() }
}));
const push = vi.hoisted(() => ({ sendWebPush: vi.fn() }));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/lib/web-push", () => ({
  isWebPushConfigured: () => true,
  sendWebPush: push.sendWebPush
}));

import { sendPushToUserIds } from "@/src/server/push-notify";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendPushToUserIds", () => {
  it("sends at most five pushes at a time and prunes stale subscriptions", async () => {
    db.pushNotificationSubscription.findMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, endpoint: `https://push.example/${i}`, p256dh: "k", auth: "a" }))
    );
    let inFlight = 0;
    let peak = 0;
    push.sendWebPush.mockImplementation(async (subscription: { endpoint: string }) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      return subscription.endpoint.endsWith("/3") ? { ok: false, stale: true } : { ok: true, stale: false };
    });

    const result = await sendPushToUserIds(["u1"], { title: "T", body: "B", url: "/" });

    expect(push.sendWebPush).toHaveBeenCalledTimes(12);
    expect(peak).toBeLessThanOrEqual(5);
    expect(result).toEqual({ sent: 11, failed: 1 });
    expect(db.pushNotificationSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["s3"] } } });
  });
});
