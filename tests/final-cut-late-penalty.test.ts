import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  memberFindUnique: vi.fn(),
  memberUpdate: vi.fn(),
  gradeFindUnique: vi.fn(),
  gradeUpdate: vi.fn(),
  cycleFindUnique: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageProgressMember: { findUnique: mocks.memberFindUnique, update: mocks.memberUpdate },
    packageGrade: { findUnique: mocks.gradeFindUnique, update: mocks.gradeUpdate },
    packageCycle: { findUnique: mocks.cycleFindUnique }
  }
}));

import { setFinalCutLatePenalty } from "@/src/server/final-cut-late-penalty";

const FINAL_CUT = new Date("2026-10-01T00:00:00.000Z");

function membership(extensionRequests: Array<Record<string, unknown>> = []) {
  return {
    id: "m1",
    row: { cycleNumber: 2, extension: extensionRequests.length > 0, extensionRequests }
  };
}

describe("setFinalCutLatePenalty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.memberFindUnique.mockResolvedValue(membership());
    mocks.cycleFindUnique.mockResolvedValue({ finalCutDate: FINAL_CUT });
  });

  it("is for executive producers only", async () => {
    await expect(
      setFinalCutLatePenalty({ rowId: "r", memberUserId: "otto", percent: 5, role: "ASSOCIATE_PRODUCER" })
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.memberUpdate).not.toHaveBeenCalled();
  });

  it("rejects a percentage that is not offered", async () => {
    await expect(
      setFinalCutLatePenalty({ rowId: "r", memberUserId: "otto", percent: 25, role: "EXECUTIVE_PRODUCER" })
    ).rejects.toThrow("BAD_REQUEST");
  });

  it("rejects someone who is not on the group", async () => {
    mocks.memberFindUnique.mockResolvedValue(null);
    await expect(
      setFinalCutLatePenalty({ rowId: "r", memberUserId: "otto", percent: 5, role: "EXECUTIVE_PRODUCER" })
    ).rejects.toThrow("NOT_FOUND");
  });

  it("stores the override and leaves an ungraded member alone", async () => {
    mocks.gradeFindUnique.mockResolvedValue(null);

    await setFinalCutLatePenalty({ rowId: "r", memberUserId: "otto", percent: 10, role: "EXECUTIVE_PRODUCER" });

    expect(mocks.memberUpdate).toHaveBeenCalledWith({ where: { id: "m1" }, data: { latePenaltyPercent: 10 } });
    expect(mocks.gradeUpdate).not.toHaveBeenCalled();
  });

  it("recomputes a graded member's official points with the override", async () => {
    mocks.gradeFindUnique.mockResolvedValue({
      id: "g1",
      awardedFinalCutPoints: 40,
      turnedInDate: new Date("2026-10-04T00:00:00.000Z")
    });

    await setFinalCutLatePenalty({ rowId: "r", memberUserId: "otto", percent: 5, role: "EXECUTIVE_PRODUCER" });

    expect(mocks.gradeUpdate).toHaveBeenCalledWith({ where: { id: "g1" }, data: { finalCutPoints: 38 } });
  });

  it("goes back to the automatic late penalty when the override is cleared", async () => {
    mocks.gradeFindUnique.mockResolvedValue({
      id: "g1",
      awardedFinalCutPoints: 40,
      turnedInDate: new Date("2026-10-04T00:00:00.000Z")
    });

    await setFinalCutLatePenalty({ rowId: "r", memberUserId: "otto", percent: null, role: "SUPER_ADMIN" });

    expect(mocks.memberUpdate).toHaveBeenCalledWith({ where: { id: "m1" }, data: { latePenaltyPercent: null } });
    expect(mocks.gradeUpdate).toHaveBeenCalledWith({ where: { id: "g1" }, data: { finalCutPoints: 32 } });
  });

  it("uses the member's own extension for the automatic penalty", async () => {
    mocks.memberFindUnique.mockResolvedValue(
      membership([{ requestedDays: 5, grantedDays: 5, grantedUserIds: ["otto"] }])
    );
    mocks.gradeFindUnique.mockResolvedValue({
      id: "g1",
      awardedFinalCutPoints: 40,
      turnedInDate: new Date("2026-10-04T00:00:00.000Z")
    });

    await setFinalCutLatePenalty({ rowId: "r", memberUserId: "otto", percent: null, role: "EXECUTIVE_PRODUCER" });

    expect(mocks.gradeUpdate).toHaveBeenCalledWith({ where: { id: "g1" }, data: { finalCutPoints: 40 } });
  });
});
