import type { DashboardStage } from "@/src/server/dashboard-data";

export type HomeStageTone = "done" | "current" | "locked";

export type HomeStageStep = DashboardStage & {
  tone: HomeStageTone;
  href: string;
};

const STAGE_HREF: Record<DashboardStage["key"], string> = {
  proofOfContact: "/brainstorming",
  aRollBRoll: "/a-roll",
  initialCut: "/initial-cut",
  finalCut: "/final-cut"
};

/** Stage timeline for Home: the first unsubmitted stage is the one to work on now. */
export function homeStageSteps(stages: DashboardStage[]): HomeStageStep[] {
  const currentIndex = stages.findIndex((stage) => !stage.done);
  return stages.map((stage, index) => ({
    ...stage,
    href: STAGE_HREF[stage.key],
    tone: stage.done ? "done" : index === currentIndex ? "current" : "locked"
  }));
}
