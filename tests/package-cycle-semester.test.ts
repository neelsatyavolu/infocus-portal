import { describe, expect, it } from "vitest";
import { cycleSemesterTerm, parseSemesterTerm } from "@/src/lib/package-grades";

describe("cycle semester mapping", () => {
  it("puts cycles 1–3 in semester 1 and cycle 4+ in semester 2", () => {
    expect(cycleSemesterTerm(1)).toBe(1);
    expect(cycleSemesterTerm(2)).toBe(1);
    expect(cycleSemesterTerm(3)).toBe(1);
    expect(cycleSemesterTerm(4)).toBe(2);
    expect(cycleSemesterTerm(5)).toBe(2);
  });

  it("reads the term from a semester label", () => {
    expect(parseSemesterTerm("2026-27 S1")).toBe(1);
    expect(parseSemesterTerm("26-27 S2")).toBe(2);
    expect(parseSemesterTerm("Semester")).toBeNull();
  });
});
