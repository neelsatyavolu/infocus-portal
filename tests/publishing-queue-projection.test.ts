import { describe, expect, it } from "vitest";
import {
  averagePackagesPerCycle,
  packageSlotsLeft,
  projectOverflow,
  projectYearPackages
} from "@/src/lib/publishing-queue-projection";

const days = (dates: string[], special: string[] = []) => dates.map((date) => ({ date, special: special.includes(date) }));

describe("projected overflow", () => {
  it("averages finished cycles, ignoring one still under way", () => {
    expect(
      averagePackagesPerCycle([
        { cycleNumber: 1, packages: 12, finished: true },
        { cycleNumber: 2, packages: 17, finished: true },
        { cycleNumber: 3, packages: 3, finished: false }
      ])
    ).toBe(14.5);
  });

  it("falls back to cycles with packages before any cycle has finished", () => {
    expect(averagePackagesPerCycle([{ cycleNumber: 1, packages: 10, finished: false }])).toBe(10);
    expect(averagePackagesPerCycle([])).toBeNull();
  });

  it("counts finished cycles as made and the rest as at least average", () => {
    const cycles = [
      { cycleNumber: 1, packages: 12, finished: true },
      { cycleNumber: 2, packages: 17, finished: true },
      { cycleNumber: 3, packages: 20, finished: false }
    ];
    // 12 + 17 + 20 (above average) + 14.5 × 3
    expect(projectYearPackages(cycles, 6, 14.5)).toBe(93);
  });

  it("takes lost shows off each semester, counting named or held shows toward them", () => {
    const fall = ["2026-12-02", "2026-12-04", "2026-12-09", "2026-12-11"];
    const spring = ["2027-01-08", "2027-01-13", "2027-01-15"];
    // Fall: 3 regular − (2 − 1 held) = 2. Spring: 3 regular − 2 = 1.
    expect(packageSlotsLeft(days([...fall, ...spring], ["2026-12-11"]), "2027-01-08")).toBe(3);
    // Three held shows in a semester already cover its lost shows.
    expect(packageSlotsLeft(days(fall, ["2026-12-02", "2026-12-04", "2026-12-09"]), "2027-01-08")).toBe(1);
    expect(packageSlotsLeft([], "2027-01-08")).toBe(0);
  });

  it("is what the year makes, less what aired, beyond the shows left", () => {
    const projection = projectOverflow({
      cycles: [
        { cycleNumber: 1, packages: 12, finished: true },
        { cycleNumber: 2, packages: 17, finished: true }
      ],
      cyclesInYear: 6,
      airedPackages: 20,
      upcomingCustomPackages: 1,
      showDays: days(["2027-01-08", "2027-01-13", "2027-01-15", "2027-01-20"]),
      secondSemesterStart: "2027-01-08",
      lastDay: "2027-06-03"
    });
    // 87 projected − 20 aired + 1 custom = 68 to air; 4 shows − 2 lost = 2 slots.
    expect(projection).toMatchObject({ projectedPackages: 87, packagesLeftToAir: 68, slotsLeft: 2, overflow: 66 });
  });

  it("never goes below zero, and is null with no packages yet", () => {
    const base = { cyclesInYear: 2, airedPackages: 0, upcomingCustomPackages: 0, secondSemesterStart: null, lastDay: "2027-06-03" };
    const many = days(Array.from({ length: 30 }, (_, index) => `2027-02-${String(index + 1).padStart(2, "0")}`));
    expect(projectOverflow({ ...base, cycles: [{ cycleNumber: 1, packages: 2, finished: true }], showDays: many })?.overflow).toBe(0);
    expect(projectOverflow({ ...base, cycles: [], showDays: many })).toBeNull();
  });
});
