import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activityEventFindMany: vi.fn(),
  ensurePackageProgressDefaults: vi.fn(),
  progressRowFindMany: vi.fn(),
  cycleFindUnique: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    activityEvent: {
      findMany: mocks.activityEventFindMany
    },
    packageProgressRow: { findMany: mocks.progressRowFindMany },
    packageCycle: { findUnique: mocks.cycleFindUnique }
  }
}));

vi.mock("@/src/server/package-progress-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/server/package-progress-data")>()),
  ensurePackageProgressDefaults: mocks.ensurePackageProgressDefaults
}));

import { getDashboardData } from "@/src/server/dashboard-data";

describe("dashboard activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensurePackageProgressDefaults.mockResolvedValue([{ cycleNumber: 1, finalCutDate: null }]);
    mocks.progressRowFindMany.mockResolvedValue([]);
    mocks.cycleFindUnique.mockResolvedValue(null);
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

  it("builds up next from only the viewer's row of the active cycle", async () => {
    const past = new Date("2020-01-10T00:00:00.000Z");
    const due = new Date("2999-03-01T00:00:00.000Z");
    mocks.ensurePackageProgressDefaults.mockResolvedValue([
      { cycleNumber: 1, finalCutDate: past },
      { cycleNumber: 2, finalCutDate: due }
    ]);
    const person = (id: string, name: string | null, nickname: string | null, email: string | null) => ({
      id, name, nickname, email
    });
    mocks.progressRowFindMany.mockResolvedValue([
      {
        groupMembers: "@[Otto](other)", groupTopic: "Other", pitching: true, proofOfContact: false,
        aRollBRoll: false, initialCut: false, finalCut: false,
        assignedProducer: null, assignedExecutiveProducer: null, members: []
      },
      {
        groupMembers: "@[Abby](user_self)", groupTopic: "  Bike lanes ", pitching: true, proofOfContact: true,
        aRollBRoll: false, initialCut: false, finalCut: false,
        assignedProducer: null,
        assignedExecutiveProducer: person("ep", "Sage Producer", "Sage", "sage@example.edu"),
        members: [
          { user: person("user_self", "Abby Reporter", null, "abby@example.edu") },
          { user: person("u2", null, null, "otto@example.edu") }
        ]
      }
    ]);
    mocks.cycleFindUnique.mockResolvedValue({
      proofOfContactDate: null, aRollBRollDate: null, initialCutDate: null, finalCutDate: due
    });

    const { upNext } = await getDashboardData({
      userId: "user_self", userName: "Abby", userEmail: "abby@example.edu", workspaceIds: []
    });

    expect(mocks.progressRowFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cycleNumber: 2 }, orderBy: { rowOrder: "asc" } })
    );
    expect(mocks.cycleFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { cycleNumber: 2 } }));
    expect(upNext).toEqual({
      cycleNumber: 2,
      groupTopic: "Bike lanes",
      finalCutDate: due.toISOString(),
      producerName: "Sage",
      memberNames: ["Abby Reporter", "otto@example.edu"],
      checkInsDone: 2,
      checkInsTotal: 4,
      stages: [
        { key: "proofOfContact", label: "Brainstorming & Proof of Contact", done: true, dueDate: null },
        { key: "aRollBRoll", label: "A-roll / B-roll", done: false, dueDate: null },
        { key: "initialCut", label: "Initial Cut", done: false, dueDate: null },
        { key: "finalCut", label: "Final Cut", done: false, dueDate: due.toISOString() }
      ]
    });
  });
});
