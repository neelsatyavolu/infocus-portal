import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cycleFindMany: vi.fn(),
  cycleCreateMany: vi.fn(),
  rowGroupBy: vi.fn(),
  rowCreateMany: vi.fn(),
  getCycleNumbers: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageCycle: { findMany: mocks.cycleFindMany, createMany: mocks.cycleCreateMany },
    packageProgressRow: { groupBy: mocks.rowGroupBy, createMany: mocks.rowCreateMany }
  }
}));
vi.mock("@/src/server/program-settings", () => ({ getCycleNumbers: mocks.getCycleNumbers }));

import { ensurePackageProgressDefaults, missingCycleNumbers } from "@/src/server/package-progress-data";

const cycle = (cycleNumber: number) => ({
  cycleNumber,
  focus: "",
  pitchingDate: null,
  proofOfContactDate: null,
  aRollBRollDate: null,
  initialCutDate: null,
  finalCutDate: null
});

describe("missingCycleNumbers", () => {
  it("keeps the wanted cycles that do not exist yet, in order", () => {
    expect(missingCycleNumbers([1, 2, 3, 4], new Set([2, 4]))).toEqual([1, 3]);
    expect(missingCycleNumbers([1, 2], new Set([1, 2]))).toEqual([]);
  });
});

describe("ensurePackageProgressDefaults", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only reads when every cycle and its rows already exist", async () => {
    mocks.getCycleNumbers.mockResolvedValue([1, 2]);
    mocks.cycleFindMany.mockResolvedValue([cycle(1), cycle(2)]);
    mocks.rowGroupBy.mockResolvedValue([{ cycleNumber: 1 }, { cycleNumber: 2 }]);

    const cycles = await ensurePackageProgressDefaults();

    expect(cycles.map((entry) => entry.cycleNumber)).toEqual([1, 2]);
    expect(mocks.rowGroupBy).toHaveBeenCalledWith({ by: ["cycleNumber"] });
    expect(mocks.cycleFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.cycleCreateMany).not.toHaveBeenCalled();
    expect(mocks.rowCreateMany).not.toHaveBeenCalled();
  });

  it("creates missing cycles and rows, then returns the reloaded cycles", async () => {
    mocks.getCycleNumbers.mockResolvedValue([1, 2, 3]);
    mocks.cycleFindMany
      .mockResolvedValueOnce([cycle(1)])
      .mockResolvedValueOnce([cycle(1), cycle(2), cycle(3)]);
    mocks.rowGroupBy.mockResolvedValue([{ cycleNumber: 1 }, { cycleNumber: 2 }]);

    const cycles = await ensurePackageProgressDefaults();

    expect(mocks.cycleCreateMany).toHaveBeenCalledWith({
      data: [
        { cycleNumber: 2, focus: "" },
        { cycleNumber: 3, focus: "" }
      ]
    });
    const rowData = mocks.rowCreateMany.mock.calls[0][0].data as Array<{ cycleNumber: number }>;
    expect(rowData).toHaveLength(10);
    expect(rowData.every((row) => row.cycleNumber === 3)).toBe(true);
    expect(cycles.map((entry) => entry.cycleNumber)).toEqual([1, 2, 3]);
  });
});
