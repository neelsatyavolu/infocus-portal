import type { PlatformRole } from "@prisma/client";
import { MAX_FINAL_CUT_POINTS } from "@/src/lib/grading";
import { cycleSemesterTerm } from "@/src/lib/package-grades";
import { MAX_CHECK_IN_POINTS_PER_CYCLE } from "@/src/lib/package-stages";

/** Regular reporters: 3 packages in S1, 4 in S2 (capped by how many cycles exist). */
export const STUDENT_REQUIRED_CYCLES = { 1: 3, 2: 4 } as const;
/** Associate producers: 2 packages in S1, 3 in S2. */
export const ASSOCIATE_REQUIRED_CYCLES = { 1: 2, 2: 3 } as const;

export function isAssociateProducerRole(role: PlatformRole | null | undefined) {
  return role === "ASSOCIATE_PRODUCER";
}

export function requiredCyclesForRole(
  role: PlatformRole | null | undefined,
  term: 1 | 2,
  availableCount: number
) {
  const table = isAssociateProducerRole(role) ? ASSOCIATE_REQUIRED_CYCLES : STUDENT_REQUIRED_CYCLES;
  return Math.min(table[term], Math.max(0, availableCount));
}

export function semesterCheckInMax(
  role: PlatformRole | null | undefined,
  term: 1 | 2,
  availableCount: number
) {
  return requiredCyclesForRole(role, term, availableCount) * MAX_CHECK_IN_POINTS_PER_CYCLE;
}

export type CycleQuotaInput = {
  cycleNumber: number;
  isMember: boolean;
  finalCutPoints: number | null;
  finalCutExcluded?: boolean;
  checkInPoints: number | null;
  checkInPossible: number | null;
  finalDeadlinePassed: boolean;
};

export type CycleQuotaResult = {
  countedCycles: boolean[];
  /** Per-cycle scores for tiles / All Grades. AP skips stay null until a missed quota pads a 0. */
  displayFinalCutPoints: Array<number | null>;
  displayCheckInPoints: Array<number | null>;
  displayCheckInPossible: Array<number | null>;
  /** Best required-N (plus missed-quota zeros) used for the weighted percentage. */
  countedFinalCutPoints: Array<number | null>;
  countedCheckInPoints: Array<number | null>;
  countedCheckInPossible: Array<number | null>;
};

function cycleRank(cycle: CycleQuotaInput) {
  const earned = (cycle.finalCutPoints ?? 0) + (cycle.checkInPoints ?? 0);
  const possible =
    (cycle.finalCutPoints !== null ? MAX_FINAL_CUT_POINTS : 0) +
    (cycle.checkInPoints !== null ? (cycle.checkInPossible ?? 0) : 0);
  if (possible <= 0) return -1;
  return earned / possible;
}

/**
 * Associates may skip cycles. Skipped work is excluded (not a 0) unless they
 * still cannot meet the semester quota after remaining finals have passed.
 * Extra packages they join can replace a weaker counted cycle.
 */
export function applyCycleRequirementQuota(
  cycles: CycleQuotaInput[],
  role: PlatformRole | null | undefined
): CycleQuotaResult {
  const countedCycles = cycles.map(() => true);
  const displayFinalCutPoints = cycles.map((cycle) => cycle.finalCutPoints);
  const displayCheckInPoints = cycles.map((cycle) => cycle.checkInPoints);
  const displayCheckInPossible = cycles.map((cycle) => cycle.checkInPossible);
  const countedFinalCutPoints = [...displayFinalCutPoints];
  const countedCheckInPoints = [...displayCheckInPoints];
  const countedCheckInPossible = [...displayCheckInPossible];

  if (!isAssociateProducerRole(role)) {
    return {
      countedCycles,
      displayFinalCutPoints,
      displayCheckInPoints,
      displayCheckInPossible,
      countedFinalCutPoints,
      countedCheckInPoints,
      countedCheckInPossible
    };
  }

  for (const term of [1, 2] as const) {
    const indices = cycles
      .map((cycle, index) => (cycleSemesterTerm(cycle.cycleNumber) === term ? index : -1))
      .filter((index) => index >= 0);
    if (indices.length === 0) continue;

    const required = requiredCyclesForRole(role, term, indices.length);
    const memberIdx = indices.filter((index) => cycles[index]!.isMember);
    const skippedIdx = indices.filter((index) => !cycles[index]!.isMember);

    for (const index of skippedIdx) {
      countedCycles[index] = false;
      displayFinalCutPoints[index] = null;
      displayCheckInPoints[index] = null;
      displayCheckInPossible[index] = null;
      countedFinalCutPoints[index] = null;
      countedCheckInPoints[index] = null;
      countedCheckInPossible[index] = null;
    }

    const ranked = [...memberIdx].sort((left, right) => cycleRank(cycles[right]!) - cycleRank(cycles[left]!));
    const kept = new Set(ranked.slice(0, required));
    for (const index of memberIdx) {
      if (kept.has(index)) continue;
      countedCycles[index] = false;
      countedFinalCutPoints[index] = null;
      countedCheckInPoints[index] = null;
      countedCheckInPossible[index] = null;
    }

    let selected = kept.size;
    const futureSlots = skippedIdx.filter((index) => !cycles[index]!.finalDeadlinePassed).length;
    if (selected + futureSlots >= required) continue;

    for (const index of skippedIdx) {
      if (selected >= required) break;
      if (!cycles[index]!.finalDeadlinePassed) continue;
      countedCycles[index] = true;
      displayFinalCutPoints[index] = cycles[index]!.finalCutExcluded ? null : 0;
      displayCheckInPoints[index] = 0;
      displayCheckInPossible[index] = MAX_CHECK_IN_POINTS_PER_CYCLE;
      countedFinalCutPoints[index] = cycles[index]!.finalCutExcluded ? null : 0;
      countedCheckInPoints[index] = 0;
      countedCheckInPossible[index] = MAX_CHECK_IN_POINTS_PER_CYCLE;
      selected += 1;
    }
  }

  return {
    countedCycles,
    displayFinalCutPoints,
    displayCheckInPoints,
    displayCheckInPossible,
    countedFinalCutPoints,
    countedCheckInPoints,
    countedCheckInPossible
  };
}
