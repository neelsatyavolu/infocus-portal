import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPlatformAccess: vi.fn(),
  ensureDefaults: vi.fn(),
  resolveStudentCycleNumber: vi.fn(),
  loadPackages: vi.fn(),
  assignmentFindUnique: vi.fn()
}));

vi.mock("@/src/lib/platform-admin", () => ({
  getPlatformAccess: mocks.getPlatformAccess,
  normalizeEmail: (email: string | null) => (email ?? "").trim().toLowerCase()
}));
vi.mock("@/src/lib/prisma", () => ({
  prisma: { platformRoleAssignment: { findUnique: mocks.assignmentFindUnique } }
}));
vi.mock("@/src/server/package-progress-data", () => ({ ensurePackageProgressDefaults: mocks.ensureDefaults }));
vi.mock("@/src/server/package-cycle-stage", () => ({ resolveStudentCycleNumber: mocks.resolveStudentCycleNumber }));
vi.mock("@/src/server/package-brainstorm", () => ({ loadStudentBrainstormPackages: mocks.loadPackages }));

import { loadBrainstormingPayload } from "@/src/server/brainstorming-payload";

const cycles = [
  { cycleNumber: 1, focus: "News", finalCutDate: null },
  { cycleNumber: 2, focus: "", finalCutDate: null }
];

describe("loadBrainstormingPayload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureDefaults.mockResolvedValue(cycles);
    mocks.resolveStudentCycleNumber.mockResolvedValue(2);
    mocks.loadPackages.mockResolvedValue([{ id: "row-1" }]);
  });

  it("reads the cycles once and hands them to the student cycle lookup", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: null });

    const payload = await loadBrainstormingPayload({ userId: "u-abby", email: "abby@example.edu", requestedCycleNumber: null });

    expect(mocks.ensureDefaults).toHaveBeenCalledTimes(1);
    expect(mocks.resolveStudentCycleNumber).toHaveBeenCalledWith("u-abby", null, cycles);
    expect(mocks.assignmentFindUnique).not.toHaveBeenCalled();
    expect(mocks.loadPackages).toHaveBeenCalledWith("u-abby", 2, { platformRole: null, producerCategory: null });
    expect(payload).toEqual({
      currentUserId: "u-abby",
      canApprove: false,
      activeCycleNumber: 2,
      cycles: [
        { cycleNumber: 1, focus: "News" },
        { cycleNumber: 2, focus: "" }
      ],
      packages: [{ id: "row-1" }]
    });
  });

  it("uses a requested cycle as is", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: null });

    const payload = await loadBrainstormingPayload({ userId: "u-abby", email: "abby@example.edu", requestedCycleNumber: 1 });

    expect(mocks.resolveStudentCycleNumber).not.toHaveBeenCalled();
    expect(payload.activeCycleNumber).toBe(1);
  });

  it("loads the category only for associate producers", async () => {
    mocks.getPlatformAccess.mockResolvedValue({ role: "ASSOCIATE_PRODUCER" });
    mocks.assignmentFindUnique.mockResolvedValue({ category: "FEATURE" });

    await loadBrainstormingPayload({ userId: "u-otto", email: "Otto@example.edu", requestedCycleNumber: null });

    expect(mocks.assignmentFindUnique).toHaveBeenCalledWith({
      where: { email: "otto@example.edu" },
      select: { category: true }
    });
    expect(mocks.loadPackages).toHaveBeenCalledWith("u-otto", 2, {
      platformRole: "ASSOCIATE_PRODUCER",
      producerCategory: "FEATURE"
    });
  });
});
