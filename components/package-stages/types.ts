import type { FinalCutGradeCardData } from "@/components/package-cycle/final-cut-grade-card";
import type { PackageOfCyclePanelData } from "@/components/package-cycle/package-of-cycle-card";
import type { CycleStageSlug } from "@/src/lib/package-cycle-gates";
import type { RollKind } from "@/src/lib/package-roll-kind";

/** One video on a stage page, as GET /api/package-cycle/stage returns it. */
export type StageMediaCard = {
  id: string;
  title: string;
  rollKind: RollKind | null;
  projectId: string | null;
  versionId: string | null;
  versionNumber: number;
  /** Raw MediaStatus (UPLOADING / PROCESSING / READY / FAILED). */
  status: string;
  approvalStatus?: string;
  approvedInStage?: 1 | 2 | 3 | null;
  thumbnailUrl: string | null;
  playbackUrl: string | null;
  commentCount: number;
  /** A-roll only, producers only: uploaded after the latest revision request. */
  isNew?: boolean;
};

export type StagePerson = { userId: string; name: string | null; email: string | null };

export type StageRow = {
  id: string;
  cycleNumber: number;
  groupTopic: string;
  headline?: string | null;
  toss?: string;
  packageOfCycleAt?: string | null;
  finalCut?: boolean;
  proofOfContact: boolean;
  aRollBRoll: boolean;
  aRollNeedsChanges?: boolean;
  initialCut: boolean;
  awaitingRevisedInitialCut: boolean;
  initialCutNeedsRevisions?: boolean;
  queuedForAirAt: string | null;
  approvalStage: string;
  remainingExecutiveSignoffs?: number;
  assignedProducer?: { id: string; name: string | null; email: string | null } | null;
  members: StagePerson[];
};

export type StageCutApproval = {
  canAct: boolean;
  canUnapprove: boolean;
  canApproveAnyway?: boolean;
  stage: string;
};

export type StageView = {
  empty: boolean;
  slug: CycleStageSlug;
  isProducer: boolean;
  unlocked?: boolean;
  canUpload?: boolean;
  allowSecondFinalCut?: boolean;
  canComment?: boolean;
  canApproveAroll?: boolean;
  cutApproval?: StageCutApproval | null;
  canGradeFinalCut?: boolean;
  finalCutGrade?: FinalCutGradeCardData | null;
  packageOfCycle?: PackageOfCyclePanelData | null;
  canEditToss?: boolean;
  row?: StageRow;
  media?: StageMediaCard[];
};

export const STAGE_TITLES: Record<CycleStageSlug, string> = {
  "a-roll": "A-roll/B-roll",
  "initial-cut": "Initial Cut",
  "final-cut": "Final Cut"
};

export function personLabel(
  person: { name: string | null; email: string | null } | null | undefined,
  fallback = "Member"
) {
  return person?.name?.trim() || person?.email || fallback;
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}
