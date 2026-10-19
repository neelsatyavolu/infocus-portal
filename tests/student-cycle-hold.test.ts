import { describe, expect, it } from "vitest";
import { studentCycleChoice, studentCycleNumber } from "@/src/lib/package-cycle-gates";

describe("studentCycleNumber", () => {
  it("keeps a student on the previous cycle until its Final Cut is in", () => {
    expect(studentCycleNumber(2, { finalCutMediaItemId: null, finalCut: false })).toBe(1);
  });

  it("moves to the active cycle once the Final Cut is uploaded", () => {
    expect(studentCycleNumber(2, { finalCutMediaItemId: "media-1", finalCut: false })).toBe(2);
  });

  it("moves on when a producer marked the Final Cut done by hand", () => {
    expect(studentCycleNumber(2, { finalCutMediaItemId: null, finalCut: true })).toBe(2);
  });

  it("uses the active cycle when the student was not on the previous roster", () => {
    expect(studentCycleNumber(2, null)).toBe(2);
    expect(studentCycleNumber(1, null)).toBe(1);
  });
});

describe("studentCycleChoice", () => {
  const held = { cycleNumber: 1, finalCutMediaItemId: null, finalCut: false };
  const next = { cycleNumber: 2, finalCutMediaItemId: null, finalCut: false };

  it("offers both cycles to a held student who is also on the new roster", () => {
    expect(studentCycleChoice(2, [held, next], null)).toEqual({ cycleNumber: 1, choices: [1, 2] });
  });

  it("opens the new cycle when the student picked it", () => {
    expect(studentCycleChoice(2, [held, next], 2)).toEqual({ cycleNumber: 2, choices: [1, 2] });
  });

  it("offers no switch when the student is not on the new roster yet", () => {
    expect(studentCycleChoice(2, [held], 2)).toEqual({ cycleNumber: 1, choices: null });
  });

  it("offers no switch once the previous Final Cut is in", () => {
    const done = { ...held, finalCutMediaItemId: "media-1" };
    expect(studentCycleChoice(2, [done, next], 1)).toEqual({ cycleNumber: 2, choices: null });
  });

  it("ignores a pick that is not one of the two cycles", () => {
    expect(studentCycleChoice(3, [{ ...held, cycleNumber: 2 }, { ...next, cycleNumber: 3 }], 2)).toEqual({
      cycleNumber: 2,
      choices: [2, 3]
    });
    expect(studentCycleChoice(2, [held, next], 5)).toEqual({ cycleNumber: 1, choices: [1, 2] });
  });
});
