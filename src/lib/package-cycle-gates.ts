import type { PackageApprovalStage } from "@prisma/client";
import { isApprovedForFinalCut, type ApprovalState } from "@/src/lib/package-approval";

export const CYCLE_STAGE_SLUGS = ["a-roll", "initial-cut", "final-cut"] as const;
export type CycleStageSlug = (typeof CYCLE_STAGE_SLUGS)[number];

export const CYCLE_STAGE_FOLDERS: Record<CycleStageSlug, string> = {
  "a-roll": "A-roll B-roll",
  "initial-cut": "Initial Cut",
  "final-cut": "Final Cut"
};

export function isCycleStageSlug(value: string): value is CycleStageSlug {
  return (CYCLE_STAGE_SLUGS as readonly string[]).includes(value);
}

export type CycleGateRow = {
  proofOfContact: boolean;
  aRollBRoll: boolean;
  finalCutMediaItemId?: string | null;
};

export function studentStageUnlocked(
  slug: CycleStageSlug,
  row: CycleGateRow,
  approval: Pick<ApprovalState, "stage"> | null
) {
  if (slug === "a-roll") {
    return row.proofOfContact;
  }
  if (slug === "initial-cut") {
    return row.aRollBRoll;
  }
  return Boolean(approval && isApprovedForFinalCut({ stage: approval.stage, controversial: false, signoffs: [] }));
}

export function studentCanUpload(
  slug: CycleStageSlug,
  row: CycleGateRow & { aRollBRoll?: boolean },
  approval: Pick<ApprovalState, "stage"> | null,
  options?: { allowSecondFinalCut?: boolean }
) {
  if (!studentStageUnlocked(slug, row, approval)) {
    return false;
  }
  if (slug === "a-roll") {
    return !row.aRollBRoll;
  }
  if (slug === "final-cut") {
    if (!row.finalCutMediaItemId) {
      return true;
    }
    return Boolean(options?.allowSecondFinalCut);
  }
  return true;
}

export function parseApprovalStage(value: PackageApprovalStage | string | null | undefined): PackageApprovalStage | null {
  if (!value) return null;
  return value as PackageApprovalStage;
}
