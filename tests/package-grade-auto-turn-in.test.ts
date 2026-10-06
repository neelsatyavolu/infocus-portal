import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  mediaItem: { findUnique: vi.fn() },
  packageCycle: { findUnique: vi.fn() },
  packageGrade: { findMany: vi.fn(), upsert: vi.fn() }
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: db }));
vi.mock("@/src/lib/extensions", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/src/lib/extensions")>(),
  getAdminEmailSet: vi.fn().mockResolvedValue(new Set(["adviser@example.edu"]))
}));
import { syncTurnedInDateForUpload } from "@/src/server/package-grade-auto-turn-in";

const member = (userId: string, email: string) => ({ userId, user: { email } });

beforeEach(() => {
  vi.clearAllMocks();
  db.packageCycle.findUnique.mockResolvedValue({ finalCutDate: null });
  db.packageGrade.upsert.mockResolvedValue({});
  db.mediaItem.findUnique.mockResolvedValue({
    project: { name: "Package Cycle 2" },
    folder: { name: "Final Cut" },
    memberAssignments: [
      member("abby", "abby@example.edu"),
      member("otto", "otto@example.edu"),
      member("adviser", "adviser@example.edu"),
      member("abby", "abby@example.edu")
    ]
  });
});

describe("auto turn-in on Final Cut upload", () => {
  it("reads every member's grade once and only writes members not yet turned in", async () => {
    db.packageGrade.findMany.mockResolvedValue([{ userId: "otto" }]);

    const updated = await syncTurnedInDateForUpload("media", new Date("2026-10-01T18:00:00.000Z"));

    expect(db.packageGrade.findMany).toHaveBeenCalledTimes(1);
    expect(db.packageGrade.findMany).toHaveBeenCalledWith({
      where: { cycleNumber: 2, userId: { in: ["abby", "otto"] }, turnedInDate: { not: null } },
      select: { userId: true }
    });
    expect(updated).toBe(1);
    expect(db.packageGrade.upsert).toHaveBeenCalledTimes(1);
    expect(db.packageGrade.upsert.mock.calls[0][0].where).toEqual({
      cycleNumber_userId: { cycleNumber: 2, userId: "abby" }
    });
    expect(db.packageGrade.upsert.mock.calls[0][0].update).toMatchObject({
      extensionDaysApplied: 0,
      freeExtensionDays: 0,
      extensionExempt: false
    });
  });

  it("skips the grade read when every member is staff", async () => {
    db.mediaItem.findUnique.mockResolvedValue({
      project: { name: "Package Cycle 2" },
      folder: null,
      memberAssignments: [member("adviser", "adviser@example.edu")]
    });
    expect(await syncTurnedInDateForUpload("media", new Date())).toBe(0);
    expect(db.packageGrade.findMany).not.toHaveBeenCalled();
  });
});
