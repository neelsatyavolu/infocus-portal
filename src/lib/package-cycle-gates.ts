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

/** Students stay on the previous cycle's tabs until that package's Final Cut is in. */
export function studentCycleNumber(
  activeCycleNumber: number,
  previousRow: { finalCutMediaItemId: string | null; finalCut: boolean } | null
) {
  if (activeCycleNumber > 1 && previousRow && !previousRow.finalCutMediaItemId && !previousRow.finalCut) {
    return activeCycleNumber - 1;
  }
  return activeCycleNumber;
}

/** Cookie holding the cycle a held student picked in the sidebar's cycle switch. */
export const STUDENT_CYCLE_COOKIE = "infocus_student_cycle";

type StudentCycleRow = { cycleNumber: number; finalCutMediaItemId: string | null; finalCut: boolean };

/**
 * The cycle a student's tabs show. A student held on the previous cycle (its Final Cut is not in)
 * opens on it by default. They may switch (`choices`) between every earlier cycle whose Final Cut
 * is still missing, the default one, and the active cycle when they are on its roster; `preferred`
 * (the cookie) opens one of those.
 */
export function studentCycleChoice(activeCycleNumber: number, rows: StudentCycleRow[], preferred: number | null) {
  const previousRow = rows.find((row) => row.cycleNumber === activeCycleNumber - 1) ?? null;
  const defaultCycle = studentCycleNumber(activeCycleNumber, previousRow);
  const owed = rows
    .filter((row) => row.cycleNumber < activeCycleNumber && !row.finalCutMediaItemId && !row.finalCut)
    .map((row) => row.cycleNumber);
  const onActiveRoster = rows.some((row) => row.cycleNumber === activeCycleNumber);
  const options = [...new Set([...owed, defaultCycle, ...(onActiveRoster ? [activeCycleNumber] : [])])].sort(
    (a, b) => a - b
  );
  const choices = options.length > 1 ? options : null;
  const cycleNumber = choices && preferred !== null && choices.includes(preferred) ? preferred : defaultCycle;
  return { cycleNumber, choices };
}

export function parseApprovalStage(value: PackageApprovalStage | string | null | undefined): PackageApprovalStage | null {
  if (!value) return null;
  return value as PackageApprovalStage;
}
