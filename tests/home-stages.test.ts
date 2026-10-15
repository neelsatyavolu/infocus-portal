import { describe, expect, it } from "vitest";
import { homeStageSteps } from "@/src/lib/home-stages";
import type { DashboardStage } from "@/src/server/dashboard-data";

function stage(key: DashboardStage["key"], done: boolean): DashboardStage {
  return { key, label: key, done, dueDate: null };
}

describe("homeStageSteps", () => {
  it("marks done stages, the first open stage as current, and later ones as locked", () => {
    const steps = homeStageSteps([
      stage("proofOfContact", true),
      stage("aRollBRoll", true),
      stage("initialCut", false),
      stage("finalCut", false)
    ]);
    expect(steps.map((step) => step.tone)).toEqual(["done", "done", "current", "locked"]);
  });

  it("links each stage to its cycle page", () => {
    const steps = homeStageSteps([
      stage("proofOfContact", false),
      stage("aRollBRoll", false),
      stage("initialCut", false),
      stage("finalCut", false)
    ]);
    expect(steps.map((step) => step.href)).toEqual(["/brainstorming", "/a-roll", "/initial-cut", "/final-cut"]);
  });

  it("has no current stage once everything is submitted", () => {
    const steps = homeStageSteps([stage("proofOfContact", true), stage("finalCut", true)]);
    expect(steps.some((step) => step.tone === "current")).toBe(false);
  });
});
