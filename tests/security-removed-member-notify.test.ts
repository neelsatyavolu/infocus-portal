import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findRow: vi.fn(),
  findSubscriptions: vi.fn(),
  sendEmails: vi.fn(),
  sendPush: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageProgressRow: { findUnique: mocks.findRow },
    pushNotificationSubscription: { findMany: mocks.findSubscriptions, deleteMany: vi.fn() }
  }
}));
vi.mock("@/src/lib/email", () => ({ sendPackageEventEmails: mocks.sendEmails }));
vi.mock("@/src/lib/hosts", () => ({ mainAppOrigin: () => "https://portal.example.edu" }));
vi.mock("@/src/server/package-progress-data", () => ({ loadRequiredFinalCutGraders: vi.fn() }));
vi.mock("@/src/lib/web-push", () => ({ isWebPushConfigured: () => true, sendWebPush: vi.fn() }));

describe("package member mail skips removed accounts", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.doMock("@/src/server/push-notify", () => ({ sendPushToUserIds: mocks.sendPush }));
    mocks.findRow
      .mockResolvedValueOnce({ cycleNumber: 2, groupTopic: "Library hours" })
      .mockResolvedValueOnce({
        members: [
          { user: { id: "abby", email: "abby@example.edu", notificationPreference: null } },
          // Soft-removed: account email cleared, but the saved notification address remains.
          { user: { id: "otto", email: null, notificationPreference: { notificationEmail: "otto.home@example.edu" } } },
          { user: { id: "sage", email: "sage@example.edu", notificationPreference: null } }
        ]
      });
  });

  it("emails and pushes only members who still have an account email", async () => {
    vi.resetModules();
    const { notifyPackageMembersOfComment } = await import("@/src/server/package-review-notify");
    await notifyPackageMembersOfComment({
      progressRowId: "row-1",
      stage: "pitching",
      authorId: "sage",
      authorName: "Sage",
      body: "Tighten the open."
    });

    expect(mocks.sendEmails).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmails.mock.calls[0][0].recipients).toEqual(["abby@example.edu"]);
    expect(mocks.sendPush).toHaveBeenCalledTimes(1);
    expect(mocks.sendPush.mock.calls[0][0]).toEqual(["abby"]);
  });
});

describe("sendPushToUserIds", () => {
  it("only reads subscriptions of accounts that still have an email", async () => {
    vi.doUnmock("@/src/server/push-notify");
    vi.resetModules();
    mocks.findSubscriptions.mockResolvedValue([]);
    const { sendPushToUserIds } = await import("@/src/server/push-notify");
    await sendPushToUserIds(["abby", "otto"], { title: "T", body: "B", url: "/" }, "comments");
    expect(mocks.findSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: { in: ["abby", "otto"] },
          user: {
            email: { not: null },
            notificationPreference: { browserEnabled: true, browserCommentsEnabled: true }
          }
        }
      })
    );
  });
});
