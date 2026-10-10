import { describe, expect, it } from "vitest";
import { mergeGradeRowAfterSave } from "@/app/(app)/grade-editor/grade-editor-client";

const row = (patch: Record<string, unknown>) =>
  ({
    finalCutState: null,
    effortPoints: 40,
    teamworkPoints: 8,
    feedback: "Good cut",
    turnedInDate: "2026-10-01",
    userId: "u1",
    ...patch
  }) as never;

describe("mergeGradeRowAfterSave", () => {
  it("keeps edits made after the save snapshot left", () => {
    const sent = row({ feedback: "Good cut", effortPoints: 40 });
    const current = row({ feedback: "Good cut — tighter open", effortPoints: 42 });
    const saved = row({ feedback: "Good cut", effortPoints: 40, totalPoints: 48, percentage: 96 });
    const merged = mergeGradeRowAfterSave(current, sent, saved);
    expect(merged.feedback).toBe("Good cut — tighter open");
    expect(merged.effortPoints).toBe(42);
    expect(merged.totalPoints).toBe(48);
  });

  it("uses the saved row when nothing changed while the request was in flight", () => {
    const sent = row({ feedback: "Good cut" });
    const saved = row({ feedback: "Good cut", totalPoints: 48 });
    expect(mergeGradeRowAfterSave(sent, sent, saved).totalPoints).toBe(48);
    expect(mergeGradeRowAfterSave(sent, sent, saved).feedback).toBe("Good cut");
  });
});
