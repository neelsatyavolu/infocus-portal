import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cycleFindMany: vi.fn(),
  cycleCreateMany: vi.fn(),
  gradeFindMany: vi.fn(),
  mediaFindMany: vi.fn(),
  buildGradeSummary: vi.fn(),
  loadGradebookExtras: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    packageCycle: { findMany: mocks.cycleFindMany, createMany: mocks.cycleCreateMany },
    packageGrade: { findMany: mocks.gradeFindMany },
    mediaItem: { findMany: mocks.mediaFindMany }
  }
}));
vi.mock("@/src/server/student-grade-summary", () => ({ buildGradeSummary: mocks.buildGradeSummary }));
vi.mock("@/src/server/student-gradebook", () => ({ loadGradebookExtras: mocks.loadGradebookExtras }));

import { currentGradebookWeekIndex, gradebookTodayKey, parseGradeTab } from "@/src/lib/grades-view";
import { loadMyGrades } from "@/src/server/grades-me";

const summary = {
  cycleNumbers: [1, 2],
  checkInStages: [],
  countedFinalCutPoints: [],
  countedCheckInPoints: [],
  countedCheckInPossible: [],
  finalCutPoints: [null, null],
  checkInPoints: [null, null],
  checkInPossible: [null, null],
  livestreamPoints: null,
  participationEarned: 0,
  participationPossible: 0,
  portfolioPoints: null,
  maxPortfolioPoints: 100,
  percentage: null,
  letter: null
};

describe("loadMyGrades", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cycleFindMany.mockResolvedValue([
      { cycleNumber: 1, focus: "Elections" },
      { cycleNumber: 2, focus: "" },
      { cycleNumber: 3, focus: "" },
      { cycleNumber: 4, focus: "" },
      { cycleNumber: 5, focus: "" },
      { cycleNumber: 6, focus: "" }
    ]);
    mocks.gradeFindMany.mockResolvedValue([
      {
        cycleNumber: 1,
        effortPoints: 40,
        teamworkPoints: 45,
        finalCutState: null,
        previousEffortPoints: null,
        previousTeamworkPoints: null,
        revisedAt: null,
        feedback: "Nice pacing",
        publishedAt: new Date("2026-09-30T12:00:00.000Z"),
        extensionDaysApplied: 0,
        freeExtensionDays: 0,
        extensionExempt: false
      }
    ]);
    mocks.mediaFindMany.mockResolvedValue([
      {
        id: "media-1",
        updatedAt: new Date("2026-09-20T12:00:00.000Z"),
        project: { id: "project-1", name: "Package Cycle 1" },
        folder: { name: "Final Cut" }
      }
    ]);
    mocks.buildGradeSummary.mockResolvedValue(summary);
    mocks.loadGradebookExtras.mockResolvedValue({ weeks: [] });
  });

  it("shows a student their published cycle grade and review link", async () => {
    const result = await loadMyGrades("student-1", "ASSOCIATE_PRODUCER");

    expect(mocks.gradeFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "student-1" } }));
    expect(mocks.buildGradeSummary).toHaveBeenCalledWith("student-1");
    expect(mocks.loadGradebookExtras).toHaveBeenCalledWith("student-1", [1, 2], []);
    expect(result.isAdmin).toBe(false);
    expect(result.cycles[0]).toMatchObject({
      cycleNumber: 1,
      published: true,
      totalPoints: 40,
      feedback: "Nice pacing",
      reviewProjectId: "project-1",
      reviewMediaId: "media-1"
    });
    expect(result.summary.publishedCycleCount).toBe(1);
  });

  it("hides published grades from executive producers", async () => {
    const result = await loadMyGrades("ep-1", "EXECUTIVE_PRODUCER");

    expect(result.isAdmin).toBe(true);
    expect(result.cycles[0]).toMatchObject({ published: false, totalPoints: null, feedback: null });
    expect(result.summary.extensionsRemaining).toBeNull();
  });
});

describe("grades view helpers", () => {
  it("parses ?tab= and defaults to home", () => {
    expect(parseGradeTab("packages")).toBe("packages");
    expect(parseGradeTab(["all", "home"])).toBe("all");
    expect(parseGradeTab("nope")).toBe("home");
    expect(parseGradeTab(undefined)).toBe("home");
  });

  it("picks the week containing today, else the last week", () => {
    const weeks = [{ weekStart: "2026-09-07" }, { weekStart: "2026-09-14" }, { weekStart: "2026-09-21" }];
    expect(currentGradebookWeekIndex(weeks, "2026-09-16")).toBe(1);
    expect(currentGradebookWeekIndex(weeks, "2026-10-05")).toBe(2);
    expect(currentGradebookWeekIndex(weeks, "2026-09-01")).toBe(2);
    expect(currentGradebookWeekIndex([], "2026-09-16")).toBe(0);
  });

  it("keeps Sunday evening Pacific on the current participation week", () => {
    const weeks = [{ weekStart: "2026-10-05" }, { weekStart: "2026-10-12" }];
    const sundayEvening = gradebookTodayKey(new Date("2026-10-12T00:30:00.000Z"));
    expect(sundayEvening).toBe("2026-10-11");
    expect(currentGradebookWeekIndex(weeks, sundayEvening)).toBe(0);
  });
});
