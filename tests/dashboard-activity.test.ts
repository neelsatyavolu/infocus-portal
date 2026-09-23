import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activityEventFindMany: vi.fn(),
  loadPackageProgressData: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    activityEvent: {
      findMany: mocks.activityEventFindMany
    }
  }
}));

vi.mock("@/src/server/package-progress-data", () => ({
  loadPackageProgressData: mocks.loadPackageProgressData
}));

import { getDashboardData } from "@/src/server/dashboard-data";

describe("dashboard activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadPackageProgressData.mockResolvedValue({
      activeCycleNumber: 1,
      rows: []
    });
    mocks.activityEventFindMany.mockResolvedValue([]);
  });

  it("loads only activity events performed by the current user", async () => {
    await getDashboardData({
      userId: "user_self",
      userName: "Neel Satyavolu",
      userEmail: "neel@example.com",
      workspaceIds: ["ws_1", "ws_2"]
    });

    expect(mocks.activityEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: { in: ["ws_1", "ws_2"] }, actorId: "user_self" }
      })
    );
  });
});
