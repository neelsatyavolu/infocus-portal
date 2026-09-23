import { describe, expect, it } from "vitest";
import { completedParticipationTotals } from "@/src/lib/student-gradebook";

const entries = [
  { date: new Date("2026-08-31T00:00:00Z"), points: 10 },
  { date: new Date("2026-09-01T00:00:00Z"), points: 15 },
  { date: new Date("2026-09-03T00:00:00Z"), points: 20 },
  { date: new Date("2026-09-08T00:00:00Z"), points: 20 },
  { date: new Date("2026-09-10T00:00:00Z"), points: 20 }
];
const input = { semesterStart: new Date("2026-08-31T00:00:00Z"), semesterEnd: new Date("2026-12-18T00:00:00Z"), entries };

describe("completed participation weeks", () => {
  it("excludes the current week from both earned and possible even when its grades are entered", () => {
    expect(completedParticipationTotals({ ...input, now: new Date("2026-09-11T20:00:00Z") })).toEqual({ earned: 45, possible: 50 });
  });

  it("keeps Sunday 11:59:59 p.m. Pacific excluded and releases the week at Monday midnight", () => {
    expect(completedParticipationTotals({ ...input, now: new Date("2026-09-14T06:59:59.999Z") })).toEqual({ earned: 45, possible: 50 });
    expect(completedParticipationTotals({ ...input, now: new Date("2026-09-14T07:00:00Z") })).toEqual({ earned: 85, possible: 90 });
  });

  it("keeps ungraded days excluded and includes an entered zero", () => {
    expect(completedParticipationTotals({
      ...input, entries: [{ date: new Date("2026-09-01T00:00:00Z"), points: 0 }],
      now: new Date("2026-09-07T07:00:00Z")
    })).toEqual({ earned: 0, possible: 20 });
    expect(completedParticipationTotals({ ...input, entries: [], now: new Date("2026-09-07T07:00:00Z") })).toEqual({ earned: 0, possible: 0 });
  });

  it("uses the Pacific cutoff after the daylight saving fall transition", () => {
    const fall = {
      semesterStart: new Date("2026-10-26T00:00:00Z"), semesterEnd: new Date("2026-10-30T00:00:00Z"),
      entries: [{ date: new Date("2026-10-27T00:00:00Z"), points: 20 }]
    };
    expect(completedParticipationTotals({ ...fall, now: new Date("2026-11-02T07:59:59Z") })).toEqual({ earned: 0, possible: 0 });
    expect(completedParticipationTotals({ ...fall, now: new Date("2026-11-02T08:00:00Z") }).earned).toBe(20);
  });

  it("excludes holiday scores, dates outside the semester and dates before participation begins", () => {
    expect(completedParticipationTotals({
      semesterStart: new Date("2026-08-13T00:00:00Z"), semesterEnd: new Date("2026-08-21T00:00:00Z"),
      now: new Date("2026-08-24T07:00:00Z"),
      entries: [
        { date: new Date("2026-08-17T00:00:00Z"), points: 10 },
        { date: new Date("2026-08-18T00:00:00Z"), points: 20 },
        { date: new Date("2026-08-20T00:00:00Z"), points: 20 },
        { date: new Date("2026-08-25T00:00:00Z"), points: 20 }
      ],
      overrides: new Map([["2026-08-20", "HOLIDAY"]])
    })).toEqual({ earned: 20, possible: 20 });
  });
});
