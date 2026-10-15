import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  cycleFindMany: vi.fn(),
  cycleCreateMany: vi.fn(),
  rowGroupBy: vi.fn(),
  rowCreateMany: vi.fn(),
  getCycleNumbers: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    packageCycle: { findMany: mocks.cycleFindMany, createMany: mocks.cycleCreateMany },
    packageProgressRow: { groupBy: mocks.rowGroupBy, createMany: mocks.rowCreateMany }
  }
}));
vi.mock("@/src/server/program-settings", () => ({ getCycleNumbers: mocks.getCycleNumbers }));

import {
  cyclesIfComplete,
  ensurePackageProgressDefaults,
  missingCycleNumbers,
  type CycleCheckRow
} from "@/src/server/package-progress-data";

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

const checkRow = (cycleNumber: number, cyclesPerSemester: number | null, hasRows = true): CycleCheckRow => ({
  ...cycle(cycleNumber),
  cyclesPerSemester,
  hasRows
});

describe("cyclesIfComplete", () => {
  it("returns the cycles, without the check columns, when every configured cycle has rows", () => {
    expect(cyclesIfComplete([checkRow(1, 2), checkRow(2, 2)])).toEqual([cycle(1), cycle(2)]);
  });

  it("keeps cycles beyond the configured count (cycles per semester was lowered)", () => {
    expect(cyclesIfComplete([checkRow(1, 1), checkRow(2, 1, false)])).toEqual([cycle(1), cycle(2)]);
  });

  it("is null when a configured cycle is missing or has no rows", () => {
    expect(cyclesIfComplete([checkRow(1, 3), checkRow(2, 3)])).toBeNull();
    expect(cyclesIfComplete([checkRow(1, 2), checkRow(2, 2, false)])).toBeNull();
  });

  it("is null with no cycles or no settings row", () => {
    expect(cyclesIfComplete([])).toBeNull();
    expect(cyclesIfComplete([checkRow(1, null)])).toBeNull();
  });
});

describe("ensurePackageProgressDefaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: the one-query check finds something missing, so the full path runs.
    mocks.queryRaw.mockResolvedValue([]);
  });

  it("returns the checked cycles from one query when everything exists", async () => {
    mocks.queryRaw.mockResolvedValue([checkRow(1, 2), checkRow(2, 2)]);

    const cycles = await ensurePackageProgressDefaults();

    expect(cycles).toEqual([cycle(1), cycle(2)]);
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.getCycleNumbers).not.toHaveBeenCalled();
    expect(mocks.cycleFindMany).not.toHaveBeenCalled();
    expect(mocks.rowGroupBy).not.toHaveBeenCalled();
    expect(mocks.cycleCreateMany).not.toHaveBeenCalled();
    expect(mocks.rowCreateMany).not.toHaveBeenCalled();
  });

  it("seeds when cycles per semester went up past the existing cycles", async () => {
    mocks.queryRaw.mockResolvedValue([checkRow(1, 3), checkRow(2, 3)]);
    mocks.getCycleNumbers.mockResolvedValue([1, 2, 3]);
    mocks.cycleFindMany
      .mockResolvedValueOnce([cycle(1), cycle(2)])
      .mockResolvedValueOnce([cycle(1), cycle(2), cycle(3)]);
    mocks.rowGroupBy.mockResolvedValue([{ cycleNumber: 1 }, { cycleNumber: 2 }]);

    const cycles = await ensurePackageProgressDefaults();

    expect(mocks.cycleCreateMany).toHaveBeenCalledWith({ data: [{ cycleNumber: 3, focus: "" }] });
    expect(mocks.rowCreateMany).toHaveBeenCalledTimes(1);
    expect(cycles.map((entry) => entry.cycleNumber)).toEqual([1, 2, 3]);
  });

  it("falls back to the full check and only reads when every cycle and its rows already exist", async () => {
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
