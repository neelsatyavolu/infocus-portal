import { describe, expect, it } from "vitest";
import { gradeScoreInput, gradeScoreLabel, numericGradeScore, parseGradeScore } from "@/src/lib/grade-score";

describe("grade score entry", () => {
  it.each(["", "-", "—", " - "])("treats %s as ungraded", (text) => {
    expect(parseGradeScore(text, 50)).toBe("UNGRADED");
  });
  it("round-trips the exempt backslash", () => {
    expect(parseGradeScore("\\", 50)).toBe("EXEMPT");
    expect(gradeScoreInput("EXEMPT")).toBe("\\");
    expect(gradeScoreLabel("EXEMPT")).toBe("Exempt");
  });
  it("keeps zero distinct from excluded work", () => {
    expect(parseGradeScore("0", 50)).toBe(0);
    expect(numericGradeScore(0)).toBe(0);
    expect(numericGradeScore("UNGRADED")).toBeNull();
    expect(gradeScoreInput("UNGRADED")).toBe("");
    expect(numericGradeScore("EXEMPT")).toBeNull();
  });
  it.each(["abc", "--", "-3", "1e4", "NaN"])("rejects invalid %s without changing the grade", (text) => {
    expect(parseGradeScore(text, 50)).toBeUndefined();
  });
  it("retains the existing numeric limit and rounding", () => {
    expect(parseGradeScore("99", 50)).toBe(50);
    expect(parseGradeScore("32.8", 50)).toBe(33);
  });
});
