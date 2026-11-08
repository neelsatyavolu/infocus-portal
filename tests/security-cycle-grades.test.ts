import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rowFindUnique: vi.fn(),
  gradeFindMany: vi.fn(),
  gradeUpsert: vi.fn(),
  historyCreate: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageProgressRow: { findUnique: mocks.rowFindUnique },
    packageGrade: { findMany: mocks.gradeFindMany, upsert: mocks.gradeUpsert },
    $transaction: mocks.transaction
  }
}));
vi.mock("@/src/server/package-progress-data", () => ({
  ensurePackageProgressDefaults: vi.fn(),
  loadRequiredFinalCutGraders: vi.fn()
}));
vi.mock("@/src/server/package-approval-service", () => ({
  getOrCreateApproval: vi.fn(),
  loadApprovalView: vi.fn()
}));
vi.mock("@/src/lib/after-response", () => ({ afterResponse: vi.fn() }));

import { publishPackageCycleGrades, savePackageCycleGradeFeedback } from "@/src/server/package-cycle-stage";

const ROW = {
  id: "row-1",
  cycleNumber: 2,
  assignedProducerUserId: "u-sage",
  members: [
    { userId: "u-abby", user: { id: "u-abby", email: "abby@example.edu", notificationPreference: null } },
    { userId: "u-otto", user: { id: "u-otto", email: "otto@example.edu", notificationPreference: null } }
  ]
};

const actions = [
  ["publishPackageCycleGrades", publishPackageCycleGrades],
  ["savePackageCycleGradeFeedback", savePackageCycleGradeFeedback]
] as const;

describe.each(actions)("%s producer gate", (_name, action) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rowFindUnique.mockResolvedValue(ROW);
    mocks.gradeFindMany.mockResolvedValue([]);
    mocks.gradeUpsert.mockResolvedValue({ id: "grade-1" });
    mocks.transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === "function"
        ? arg({ packageGrade: { upsert: mocks.gradeUpsert }, packageGradeHistoryEvent: { create: mocks.historyCreate } })
        : Promise.all(arg as Promise<unknown>[])
    );
  });

  it("refuses an associate who is not assigned to the package", async () => {
    await expect(
      action({ rowId: "row-1", role: "ASSOCIATE_PRODUCER", userId: "u-rowan", feedback: "Nice work" })
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.gradeUpsert).not.toHaveBeenCalled();
  });

  it("refuses an associate who is a member of the package", async () => {
    mocks.rowFindUnique.mockResolvedValue({
      ...ROW,
      assignedProducerUserId: "u-abby"
    });
    await expect(
      action({ rowId: "row-1", role: "ASSOCIATE_PRODUCER", userId: "u-abby", feedback: "Nice work" })
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.gradeUpsert).not.toHaveBeenCalled();
  });

  it("refuses a student", async () => {
    await expect(action({ rowId: "row-1", role: null, userId: "u-abby", feedback: "x" })).rejects.toThrow("FORBIDDEN");
    expect(mocks.rowFindUnique).not.toHaveBeenCalled();
  });

  it("lets the assigned associate act", async () => {
    await action({ rowId: "row-1", role: "ASSOCIATE_PRODUCER", userId: "u-sage", feedback: "Nice work" });
    expect(mocks.gradeUpsert).toHaveBeenCalledTimes(2);
  });

  it("lets an executive producer act on any package", async () => {
    await action({ rowId: "row-1", role: "EXECUTIVE_PRODUCER", userId: "u-rowan", feedback: "Nice work" });
    expect(mocks.gradeUpsert).toHaveBeenCalledTimes(2);
  });
});
