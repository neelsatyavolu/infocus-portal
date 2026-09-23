import { describe, expect, it } from "vitest";

import { computeMissingGradeReport } from "@/src/lib/missing-grades";

const people = [
  { id: "a", name: "Alice", email: "alice@example.com" },
  { id: "b", name: "Bob", email: "bob@example.com" },
  { id: "c", name: "Cara", email: "cara@example.com" }
];

describe("computeMissingGradeReport", () => {
  it("treats no grades anywhere as nothing started and nothing missing", () => {
    const result = computeMissingGradeReport({
      people,
      grades: [],
      cycleNumbers: [1, 2, 3, 4]
    });

    expect(result.consideredCycleNumbers).toEqual([]);
    expect(result.report).toEqual([]);
  });

  it("only considers cycles that have at least one grade (started)", () => {
    const result = computeMissingGradeReport({
      people,
      grades: [
        { userId: "a", cycleNumber: 1, published: true },
        { userId: "b", cycleNumber: 2, published: true }
      ],
      cycleNumbers: [1, 2, 3, 4]
    });

    // Cycles 3 and 4 have no grades -> not in play.
    expect(result.consideredCycleNumbers).toEqual([1, 2]);
  });

  it("flags not_entered when a started cycle has no grade for a person", () => {
    const result = computeMissingGradeReport({
      people,
      grades: [{ userId: "a", cycleNumber: 1, published: true }],
      cycleNumbers: [1, 2, 3, 4]
    });

    // Alice is fully published for the only started cycle -> not in report.
    // Bob and Cara have no grade for cycle 1 -> not_entered.
    expect(result.report).toEqual([
      { userId: "b", name: "Bob", email: "bob@example.com", missing: [{ cycleNumber: 1, status: "not_entered" }] },
      { userId: "c", name: "Cara", email: "cara@example.com", missing: [{ cycleNumber: 1, status: "not_entered" }] }
    ]);
  });

  it("flags unpublished when a grade exists but is not published", () => {
    const result = computeMissingGradeReport({
      people: [people[0]],
      grades: [{ userId: "a", cycleNumber: 1, published: false }],
      cycleNumbers: [1, 2]
    });

    expect(result.report).toEqual([
      { userId: "a", name: "Alice", email: "alice@example.com", missing: [{ cycleNumber: 1, status: "unpublished" }] }
    ]);
  });

  it("collects multiple missing cycles per person and preserves input order", () => {
    const result = computeMissingGradeReport({
      people,
      grades: [
        // Cycle 1 and 2 are started (someone has a grade in each).
        { userId: "a", cycleNumber: 1, published: true },
        { userId: "a", cycleNumber: 2, published: false },
        { userId: "c", cycleNumber: 1, published: true }
      ],
      cycleNumbers: [1, 2, 3, 4]
    });

    expect(result.consideredCycleNumbers).toEqual([1, 2]);
    expect(result.report).toEqual([
      // Alice: cycle 1 published (ok), cycle 2 unpublished (missing).
      { userId: "a", name: "Alice", email: "alice@example.com", missing: [{ cycleNumber: 2, status: "unpublished" }] },
      // Bob: nothing entered for either started cycle.
      {
        userId: "b",
        name: "Bob",
        email: "bob@example.com",
        missing: [
          { cycleNumber: 1, status: "not_entered" },
          { cycleNumber: 2, status: "not_entered" }
        ]
      },
      // Cara: cycle 1 published (ok), cycle 2 not entered (missing).
      { userId: "c", name: "Cara", email: "cara@example.com", missing: [{ cycleNumber: 2, status: "not_entered" }] }
    ]);
  });

  it("does not flag associate skips for cycles they did not join", () => {
    const result = computeMissingGradeReport({
      people: [
        { id: "ap", name: "Associate", email: "ap@example.com" },
        { id: "s", name: "Student", email: "s@example.com" }
      ],
      grades: [
        { userId: "s", cycleNumber: 1, published: true },
        { userId: "s", cycleNumber: 2, published: true }
      ],
      cycleNumbers: [1, 2],
      associateUserIds: new Set(["ap"]),
      memberCycleNumbersByUserId: new Map([["ap", new Set([2])]])
    });

    expect(result.report).toEqual([
      {
        userId: "ap",
        name: "Associate",
        email: "ap@example.com",
        missing: [{ cycleNumber: 2, status: "not_entered" }]
      }
    ]);
  });

  it("ignores grades for cycles not in the provided cycle list", () => {
    const result = computeMissingGradeReport({
      people: [people[0], people[1]],
      grades: [
        { userId: "a", cycleNumber: 9, published: false },
        { userId: "a", cycleNumber: 1, published: true }
      ],
      cycleNumbers: [1, 2]
    });

    // Cycle 9 is not a real cycle -> ignored. Only cycle 1 is started.
    expect(result.consideredCycleNumbers).toEqual([1]);
    expect(result.report).toEqual([
      { userId: "b", name: "Bob", email: "bob@example.com", missing: [{ cycleNumber: 1, status: "not_entered" }] }
    ]);
  });
});


it("omits exempt grades but still reports explicit ungraded work", () => {
  const result = computeMissingGradeReport({
    people: [{ id: "student", name: "Student", email: null }], cycleNumbers: [1, 2],
    grades: [
      { userId: "student", cycleNumber: 1, published: false, finalCutState: "EXEMPT" },
      { userId: "student", cycleNumber: 2, published: true, finalCutState: "UNGRADED" }
    ]
  });
  expect(result.report[0]?.missing).toEqual([{ cycleNumber: 2, status: "not_entered" }]);
});
