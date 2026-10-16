import { describe, expect, it } from "vitest";
import { defaultTotalsAdjustments, type TotalsAdjustments } from "@/src/lib/grade-editor-csv";
import type { CycleTab, GradeRow, MissingPayload, TotalsRow } from "@/app/(app)/grade-editor/grade-editor-types";
import {
  cycleFilterCounts,
  cycleFilterMatches,
  hasTemporaryEdits,
  latePenalizedPoints,
  latestPassedCycle,
  mergeTotalsAdjustments,
  missingCountsByCycle,
  nextCycleOverrides,
  notEnteredIdsForCycle,
  parseViewKey,
  patchMissingReport,
  publishBlockedReason,
  rowStatus,
  viewKey
} from "@/app/(app)/grade-editor/grade-editor-utils";

function gradeRow(overrides: Partial<GradeRow> = {}): GradeRow {
  return {
    finalCutState: null,
    finalCutMissing: false,
    checkInScores: { pitching: 5, proofOfContact: 5, aRollBRoll: null, initialCut: null },
    checkInOverrides: { pitching: null, proofOfContact: null, aRollBRoll: null, initialCut: null },
    userId: "abby",
    name: "Abby Example",
    email: "abby@example.edu",
    effortPoints: null,
    officialPoints: null,
    teamworkPoints: null,
    previousEffortPoints: null,
    previousTeamworkPoints: null,
    totalPoints: null,
    percentage: null,
    revised: false,
    revisedAt: null,
    feedback: "",
    turnedInDate: null,
    freeExtensionDays: 0,
    extensionDetails: { calculatedDays: 0, freeDays: 0, chargedDays: 0, exempt: false },
    published: false,
    publishedAt: null,
    publicationHistory: [],
    extensionsRemaining: 3,
    ...overrides
  };
}

function totalsRow(overrides: Partial<TotalsRow> = {}): TotalsRow {
  return {
    participationEarned: 100,
    participationPossible: 150,
    userId: "otto",
    name: "Otto Example",
    email: "otto@example.edu",
    notes: "",
    cycleTotals: [],
    checkInPoints: 30,
    checkInPossible: 40,
    livestreamPoints: null,
    livestreamHours: 2,
    portfolioPoints: null,
    ...overrides
  };
}

function adjustments(overrides: Partial<TotalsAdjustments> = {}): TotalsAdjustments {
  return { ...defaultTotalsAdjustments(), ...overrides };
}

function missingReport(overrides: Partial<MissingPayload> = {}): MissingPayload {
  return {
    cycles: [
      { cycleNumber: 1, focus: "" },
      { cycleNumber: 2, focus: "" }
    ],
    consideredCycleNumbers: [1, 2],
    people: [],
    missingReport: [
      {
        userId: "abby",
        name: "Abby Example",
        email: "abby@example.edu",
        missing: [
          { cycleNumber: 1, status: "unpublished" },
          { cycleNumber: 2, status: "not_entered" }
        ]
      },
      {
        userId: "sage",
        name: "Sage Example",
        email: "sage@example.edu",
        missing: [{ cycleNumber: 2, status: "not_entered" }]
      }
    ],
    ...overrides
  };
}

describe("mergeTotalsAdjustments", () => {
  it("seeds a reporter seen for the first time from the official credits and saved note", () => {
    const row = totalsRow({ checkInPoints: 30, livestreamPoints: 20, portfolioPoints: 90, notes: "Saved" });
    expect(mergeTotalsAdjustments({ existing: undefined, previous: undefined, row, checkInStale: false, keepNotes: false })).toEqual(
      adjustments({ checkIns: 30, livestream: 20, final: 90, notes: "Saved" })
    );
  });

  it("takes fresh official credits for fields nobody typed over, and keeps typed ones", () => {
    const previous = totalsRow({ checkInPoints: 30, livestreamPoints: 20, portfolioPoints: 90 });
    const row = totalsRow({ checkInPoints: 35, livestreamPoints: 25, portfolioPoints: 95 });
    const existing = adjustments({ checkIns: 30, livestream: 40, final: 90, extraPoints: 5, extraMax: 10, cycleOverrides: { 1: "45" } });
    expect(mergeTotalsAdjustments({ existing, previous, row, checkInStale: false, keepNotes: false })).toEqual(
      adjustments({ checkIns: 35, livestream: 40, final: 95, extraPoints: 5, extraMax: 10, cycleOverrides: { 1: "45" } })
    );
  });

  it("keeps every typed value when there is no seed row to compare with", () => {
    const existing = adjustments({ checkIns: 12, livestream: 20, final: 80 });
    const merged = mergeTotalsAdjustments({ existing, previous: undefined, row: totalsRow(), checkInStale: false, keepNotes: false });
    expect(merged).toMatchObject({ checkIns: 12, livestream: 20, final: 80 });
  });

  it("always takes fresh check-ins after a saved check-in override", () => {
    const previous = totalsRow({ checkInPoints: 30 });
    const existing = adjustments({ checkIns: 12 });
    const merged = mergeTotalsAdjustments({ existing, previous, row: totalsRow({ checkInPoints: 33 }), checkInStale: true, keepNotes: false });
    expect(merged.checkIns).toBe(33);
  });

  it("keeps a note still waiting to save, and otherwise takes the saved note", () => {
    const existing = adjustments({ notes: "Typing…" });
    const row = totalsRow({ notes: "Saved" });
    expect(mergeTotalsAdjustments({ existing, previous: row, row, checkInStale: false, keepNotes: true }).notes).toBe("Typing…");
    expect(mergeTotalsAdjustments({ existing, previous: row, row, checkInStale: false, keepNotes: false }).notes).toBe("Saved");
  });
});

describe("hasTemporaryEdits", () => {
  const row = totalsRow({ checkInPoints: 30, livestreamPoints: null, portfolioPoints: 90 });

  it("is false with no adjustments or with the loaded values", () => {
    expect(hasTemporaryEdits(row, undefined)).toBe(false);
    expect(hasTemporaryEdits(row, adjustments({ checkIns: 30, final: 90, notes: "A note saves on its own" }))).toBe(false);
  });

  it("is true once a credit, extra credit or a cycle override differs", () => {
    expect(hasTemporaryEdits(row, adjustments({ checkIns: 31, final: 90 }))).toBe(true);
    expect(hasTemporaryEdits(row, adjustments({ checkIns: 30, final: 90, extraPoints: 2, extraMax: 5 }))).toBe(true);
    expect(hasTemporaryEdits(row, adjustments({ checkIns: 30, final: 90, cycleOverrides: { 2: "40" } }))).toBe(true);
  });
});

describe("nextCycleOverrides", () => {
  it("clears on empty text and keeps the ungraded and exempt marks", () => {
    expect(nextCycleOverrides({ 1: "40" }, 1, "")).toEqual({});
    expect(nextCycleOverrides({}, 1, "-")).toEqual({ 1: "-" });
    expect(nextCycleOverrides({}, 1, "—")).toEqual({ 1: "—" });
    expect(nextCycleOverrides({}, 1, "\\")).toEqual({ 1: "\\" });
  });

  it("clamps digits to 50 and rejects anything else", () => {
    expect(nextCycleOverrides({}, 2, "73")).toEqual({ 2: "50" });
    expect(nextCycleOverrides({ 1: "40" }, 2, "07")).toEqual({ 1: "40", 2: "7" });
    expect(nextCycleOverrides({}, 2, "4a")).toBeUndefined();
    expect(nextCycleOverrides({}, 2, "4.5")).toBeUndefined();
  });

  it("does not change the map it was given", () => {
    const current = { 1: "40" };
    nextCycleOverrides(current, 1, "");
    expect(current).toEqual({ 1: "40" });
  });
});

describe("row status", () => {
  it("names the one status of a row, most important first", () => {
    expect(rowStatus(gradeRow({ published: true, effortPoints: 40 })).label).toBe("Published");
    expect(rowStatus(gradeRow({ finalCutState: "EXEMPT" })).label).toBe("Exempt");
    expect(rowStatus(gradeRow({ finalCutState: "UNGRADED" })).label).toBe("Ungraded");
    expect(rowStatus(gradeRow({ finalCutMissing: true })).label).toBe("Missed");
    expect(rowStatus(gradeRow()).label).toBe("Not entered");
    expect(rowStatus(gradeRow({ effortPoints: 40 })).label).toBe("Unpublished");
  });

  it("shows Revised only while it waits to be published again", () => {
    const waiting = rowStatus(gradeRow({ effortPoints: 40, revised: true }));
    expect([waiting.label, waiting.tone]).toEqual(["Revised", "warning"]);
    const republished = rowStatus(gradeRow({ effortPoints: 40, revised: true, published: true }));
    expect([republished.label, republished.tone]).toEqual(["Published", "success"]);
    expect(republished.title).toMatch(/changed after publishing, then published again/);
    expect(rowStatus(gradeRow({ effortPoints: 40, published: true })).title).not.toMatch(/changed after publishing/);
  });

  it("explains why a row can't be published", () => {
    expect(publishBlockedReason(gradeRow({ effortPoints: 40 }))).toBeNull();
    expect(publishBlockedReason(gradeRow({ published: true }))).toBeNull();
    expect(publishBlockedReason(gradeRow({ finalCutState: "EXEMPT" }))).toBe("Exempt and ungraded scores are not published");
    expect(publishBlockedReason(gradeRow())).toBe("Enter a Final Cut score first");
  });
});

describe("cycle filters", () => {
  const rows = [
    gradeRow({ userId: "abby", effortPoints: 40 }),
    gradeRow({ userId: "otto", effortPoints: 30, revised: true, extensionsRemaining: -2 }),
    gradeRow({ userId: "sage", finalCutMissing: true }),
    gradeRow({ userId: "rowan", finalCutState: "EXEMPT" }),
    gradeRow({ userId: "kai", effortPoints: 45, published: true })
  ];

  it("matches each chip's rule", () => {
    const ids = (filter: Parameters<typeof cycleFilterMatches>[1]) =>
      rows.filter((row) => cycleFilterMatches(row, filter, null)).map((row) => row.userId);
    expect(ids("all")).toEqual(["abby", "otto", "sage", "rowan", "kai"]);
    expect(ids("to-publish")).toEqual(["abby", "otto"]);
    expect(ids("not-entered")).toEqual(["sage"]);
    expect(ids("missed")).toEqual(["sage"]);
    expect(ids("republish")).toEqual(["otto"]);
    expect(ids("over-extensions")).toEqual(["otto"]);
  });

  it("narrows Not entered to the people the missing report lists for the cycle", () => {
    expect(cycleFilterMatches(rows[2], "not-entered", new Set(["abby"]))).toBe(false);
    expect(cycleFilterMatches(rows[2], "not-entered", new Set(["sage"]))).toBe(true);
  });

  it("counts every chip in one pass", () => {
    expect(cycleFilterCounts(rows, null)).toEqual({
      all: 5,
      "to-publish": 2,
      "not-entered": 1,
      missed: 1,
      republish: 1,
      "over-extensions": 1
    });
    expect(cycleFilterCounts(rows, new Set())["not-entered"]).toBe(0);
  });
});

describe("missing report helpers", () => {
  it("counts people per cycle, leaving out excluded people", () => {
    const report = missingReport();
    expect(Object.fromEntries(missingCountsByCycle(report, []))).toEqual({ 1: 1, 2: 2 });
    expect(Object.fromEntries(missingCountsByCycle(report, ["sage"]))).toEqual({ 1: 1, 2: 1 });
    expect(missingCountsByCycle(null, []).size).toBe(0);
  });

  it("lists who is not entered on one cycle", () => {
    const report = missingReport();
    expect([...(notEnteredIdsForCycle(report, 2) ?? [])]).toEqual(["abby", "sage"]);
    expect([...(notEnteredIdsForCycle(report, 1) ?? [])]).toEqual([]);
    expect(notEnteredIdsForCycle(null, 1)).toBeNull();
  });

  it("removes a cycle entry once the row is published, and the person once nothing is left", () => {
    const report = missingReport();
    const afterAbby = patchMissingReport(report, gradeRow({ userId: "abby", effortPoints: 40, published: true }), 1);
    expect(afterAbby.missingReport.find((person) => person.userId === "abby")?.missing).toEqual([{ cycleNumber: 2, status: "not_entered" }]);
    const afterSage = patchMissingReport(report, gradeRow({ userId: "sage", finalCutState: "EXEMPT" }), 2);
    expect(afterSage.missingReport.map((person) => person.userId)).toEqual(["abby"]);
    expect(report.missingReport).toHaveLength(2);
  });

  it("updates an entry's status and adds people who become missing", () => {
    const report = missingReport();
    const scored = patchMissingReport(report, gradeRow({ userId: "sage", effortPoints: 30 }), 2);
    expect(scored.missingReport.find((person) => person.userId === "sage")?.missing).toEqual([{ cycleNumber: 2, status: "unpublished" }]);
    const added = patchMissingReport(report, gradeRow({ userId: "kai", name: "Kai Example", email: "kai@example.edu" }), 1);
    expect(added.missingReport.find((person) => person.userId === "kai")).toEqual({
      userId: "kai",
      name: "Kai Example",
      email: "kai@example.edu",
      missing: [{ cycleNumber: 1, status: "not_entered" }]
    });
  });

  it("leaves the report alone for a cycle it doesn't consider, or a row with nothing missing", () => {
    const report = missingReport({ consideredCycleNumbers: [1] });
    expect(patchMissingReport(report, gradeRow({ userId: "kai" }), 3)).toBe(report);
    expect(patchMissingReport(report, gradeRow({ userId: "kai", published: true, effortPoints: 40 }), 1)).toBe(report);
  });
});

describe("views", () => {
  it("round-trips the remembered view key", () => {
    expect(viewKey("total", 3)).toBe("total");
    expect(viewKey("student", 3)).toBe("student");
    expect(viewKey("cycle", 3)).toBe("cycle:3");
    expect(parseViewKey("total")).toEqual({ viewMode: "total", cycleNumber: null });
    expect(parseViewKey("student")).toEqual({ viewMode: "student", cycleNumber: null });
    expect(parseViewKey("cycle:2")).toEqual({ viewMode: "cycle", cycleNumber: 2 });
  });

  it("rejects unknown or out-of-range views", () => {
    expect(parseViewKey("cycle:9")).toBeNull();
    expect(parseViewKey("cycle:")).toBeNull();
    expect(parseViewKey("grades")).toBeNull();
    expect(parseViewKey(3)).toBeNull();
    expect(parseViewKey(null)).toBeNull();
  });

  it("opens on the latest cycle whose Final Cut date has passed", () => {
    const cycles: CycleTab[] = [
      { cycleNumber: 1, focus: "", finalCutDate: "2026-09-29" },
      { cycleNumber: 2, focus: "", finalCutDate: "2026-10-14" },
      { cycleNumber: 3, focus: "", finalCutDate: "2026-11-10" },
      { cycleNumber: 4, focus: "", finalCutDate: null }
    ];
    expect(latestPassedCycle(cycles, "2026-10-15")).toBe(2);
    // The Final Cut day itself is still open (it closes at 11:59 PM Pacific).
    expect(latestPassedCycle(cycles, "2026-10-14")).toBe(1);
    expect(latestPassedCycle(cycles, "2026-09-01")).toBeNull();
    expect(latestPassedCycle([], "2026-10-15")).toBeNull();
  });

  it("reports official points only when a late penalty took points off", () => {
    expect(latePenalizedPoints(gradeRow({ effortPoints: 40, officialPoints: 32 }))).toBe(32);
    expect(latePenalizedPoints(gradeRow({ effortPoints: 40, officialPoints: 40 }))).toBeNull();
    // Unsaved edit: official points are cleared until the save returns.
    expect(latePenalizedPoints(gradeRow({ effortPoints: 40, officialPoints: null }))).toBeNull();
    expect(latePenalizedPoints(gradeRow({ effortPoints: null, officialPoints: null }))).toBeNull();
  });
});
