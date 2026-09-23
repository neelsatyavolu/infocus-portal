import { describe, expect, it } from "vitest";

import {
  buildCycleGradesCsv,
  buildTotalGradesCsv,
  defaultTotalsAdjustments
} from "@/src/lib/grade-editor-csv";

describe("grade editor CSV exports", () => {
  it("builds cycle grade CSV with computed scores and escaped feedback", () => {
    const csv = buildCycleGradesCsv({
      cycleNumber: 2,
      rows: [
        {
          name: "Ada Lovelace",
          email: "ada@example.com",
          effortPoints: 23,
          teamworkPoints: 14,
          feedback: "Strong package, \"clean\" edit\nNeeds tighter standup.",
          turnedInDate: "2026-05-04",
          extensionsRemaining: 3,
          published: true,
          revised: false
        },
        {
          name: null,
          email: null,
          effortPoints: null,
          teamworkPoints: 10,
          feedback: "",
          turnedInDate: null,
          extensionsRemaining: -1,
          published: false,
          revised: true
        }
      ]
    });

    expect(csv).toBe([
      "Cycle,Name,Email,Final Cut Points,Teamwork Points,Total Points,Percentage,Turned In Date,Extensions Remaining,Published,Revised,Feedback",
      "2,Ada Lovelace,ada@example.com,23,14,23,46.0,2026-05-04,3,Yes,No,\"Strong package, \"\"clean\"\" edit\nNeeds tighter standup.\"",
      "2,Unnamed user,,,10,,,,-1,No,Yes,"
    ].join("\n"));
  });

  it("builds total grade CSV with editable overrides and totals", () => {
    const adjustments = defaultTotalsAdjustments();
    adjustments.checkIns = 10;
    adjustments.livestream = 20;
    adjustments.final = 80;
    adjustments.cycleOverrides = { 2: "35" };
    adjustments.extraPoints = 4;
    adjustments.extraMax = 5;
    adjustments.notes = "Late add, approved";

    const csv = buildTotalGradesCsv({
      cycles: [
        { cycleNumber: 1 },
        { cycleNumber: 2 }
      ],
      checkInPossible: 10,
      rows: [
        {
          name: "Grace Hopper",
          email: "grace@example.com",
          participationEarned: 45,
          participationPossible: 50,
          cycleTotals: [
            { cycleNumber: 1, totalPoints: 38 },
            { cycleNumber: 2, totalPoints: null }
          ],
          adjustments
        }
      ]
    });

    expect(csv).toBe([
      "Name,Email,Cycle 01,Cycle 02,Check-Ins,Livestream,Participation,Final,Extra Points,Extra Max,Total Grade,Total Max,Percentage,Letter Grade,Notes",
      "Grace Hopper,grace@example.com,38,35,10,20,45/50,80,4,5,232,305,76.1,C,\"Late add, approved\""
    ].join("\n"));
  });

  it("omits ungraded check-ins, livestream, and portfolio from the total", () => {
    const csv = buildTotalGradesCsv({
      cycles: [{ cycleNumber: 1 }],
      rows: [
        {
          name: "Ada Lovelace",
          email: "ada@example.com",
          participationEarned: 0,
          participationPossible: 0,
          cycleTotals: [{ cycleNumber: 1, totalPoints: 40 }],
          adjustments: defaultTotalsAdjustments()
        }
      ]
    });

    expect(csv).toBe([
      "Name,Email,Cycle 01,Check-Ins,Livestream,Participation,Final,Extra Points,Extra Max,Total Grade,Total Max,Percentage,Letter Grade,Notes",
      "Ada Lovelace,ada@example.com,40,,,0/0,,0,0,40,50,80.0,B,"
    ].join("\n"));
  });
});


it("exports explicit ungraded/exempt labels and excludes their possible points", () => {
  const csv = buildTotalGradesCsv({
    cycles: [{ cycleNumber: 1 }, { cycleNumber: 2 }],
    checkInPossible: 60,
    rows: [{
      name: "Student", email: null, participationEarned: 0, participationPossible: 0,
      checkInPossible: 15,
      cycleTotals: [{ cycleNumber: 1, totalPoints: 40 }, { cycleNumber: 2, totalPoints: null, finalCutState: "EXEMPT" }],
      adjustments: { ...defaultTotalsAdjustments(), checkIns: 15, livestream: "EXEMPT", final: "UNGRADED", extraPoints: "EXEMPT", extraMax: 20 }
    }]
  });
  expect(csv.split("\n")[1]).toBe("Student,,40,Exempt,15,Exempt,0/0,—,Exempt,20,55,65,84.6,B,");
});


it("leaves the percentage and letter blank when all scores are excluded", () => {
  const csv = buildTotalGradesCsv({
    cycles: [], rows: [{
      name: "Student", email: null, participationEarned: 0, participationPossible: 0,
      cycleTotals: [], adjustments: {
        ...defaultTotalsAdjustments(), checkIns: "UNGRADED", livestream: "EXEMPT", final: "UNGRADED"
      }
    }]
  });
  expect(csv.split("\n")[1]).toBe("Student,,—,Exempt,0/0,—,0,0,0,0,,,");
});
