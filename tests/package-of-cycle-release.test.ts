import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cycleFindMany: vi.fn(),
  cycleFindUnique: vi.fn(),
  cycleUpsert: vi.fn(),
  rowFindMany: vi.fn(),
  rowFindUnique: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageCycle: { findMany: mocks.cycleFindMany, findUnique: mocks.cycleFindUnique, upsert: mocks.cycleUpsert },
    packageProgressRow: { findMany: mocks.rowFindMany, findUnique: mocks.rowFindUnique }
  }
}));
vi.mock("@/src/server/package-progress-data", () => ({ loadRequiredFinalCutGraders: vi.fn().mockResolvedValue([]) }));
vi.mock("@/src/server/user-signature", () => ({ loadCertificateSigners: vi.fn().mockResolvedValue([]) }));

import { loadCertificateData, loadPackageOfCycleWinners, setPackageOfCycleRelease } from "@/src/server/package-of-cycle";

const winnerRow = (cycleNumber: number) => ({
  id: `row-${cycleNumber}`,
  cycleNumber,
  groupTopic: "Bike lanes",
  packageOfCycleAt: new Date("2026-10-30T00:00:00Z"),
  finalCutMediaItem: null,
  members: [{ userId: "abby", user: { name: "Abby Example", nickname: null, email: "abby@example.edu" } }]
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cycleFindMany.mockResolvedValue([{ cycleNumber: 1 }]);
  mocks.rowFindMany.mockResolvedValue([winnerRow(2), winnerRow(1)]);
});

describe("Package of the Cycle release", () => {
  it("shows students only released cycles", async () => {
    await loadPackageOfCycleWinners(null);
    expect(mocks.rowFindMany.mock.calls[0][0].where).toEqual({ packageOfCycleAt: { not: null }, cycleNumber: { in: [1] } });
  });

  it("shows executives every winner, marking which are released", async () => {
    const winners = await loadPackageOfCycleWinners("EXECUTIVE_PRODUCER");
    expect(mocks.rowFindMany.mock.calls[0][0].where).toEqual({ packageOfCycleAt: { not: null } });
    expect(winners.map((winner) => [winner.cycleNumber, winner.released])).toEqual([
      [2, false],
      [1, true]
    ]);
  });

  it("keeps a winner's certificate locked until release", async () => {
    mocks.rowFindUnique.mockResolvedValue(winnerRow(2));
    mocks.cycleFindUnique.mockResolvedValue({ packageOfCycleReleasedAt: null });
    const input = { rowId: "row-2", memberUserId: "abby", viewerUserId: "abby", role: null };
    await expect(loadCertificateData(input)).rejects.toThrow("NOT_FOUND");
    mocks.cycleFindUnique.mockResolvedValue({ packageOfCycleReleasedAt: new Date() });
    await expect(loadCertificateData(input)).resolves.toMatchObject({ name: "Abby Example", cycleNumber: 2 });
  });

  it("lets only executives release a cycle", async () => {
    await expect(setPackageOfCycleRelease({ cycleNumber: 2, role: "ASSOCIATE_PRODUCER", released: true })).rejects.toThrow("FORBIDDEN");
    await setPackageOfCycleRelease({ cycleNumber: 2, role: "EXECUTIVE_PRODUCER", released: false });
    expect(mocks.cycleUpsert).toHaveBeenCalledWith({
      where: { cycleNumber: 2 },
      create: { cycleNumber: 2, packageOfCycleReleasedAt: null },
      update: { packageOfCycleReleasedAt: null }
    });
  });
});
