import { describe, expect, it } from "vitest";
import { studentCycleNumber } from "@/src/lib/package-cycle-gates";

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
