/** At most this many packages win Package of the Cycle in one cycle. */
export const PACKAGE_OF_CYCLE_MAX = 2;

/** A package wins once every required Final Cut grader has voted for it. */
export function packageOfCycleUnanimous(requiredGraderIds: string[], voterIds: string[]) {
  if (requiredGraderIds.length === 0) return false;
  const voters = new Set(voterIds);
  return requiredGraderIds.every((id) => voters.has(id));
}

/** Why a grader can't vote for this package, or null when the vote is allowed. */
export function packageOfCycleVoteBlocked(input: {
  hasFinalCut: boolean;
  alreadyWon: boolean;
  otherWinnersInCycle: number;
}): string | null {
  if (!input.hasFinalCut) return "This package has no Final Cut yet.";
  if (!input.alreadyWon && input.otherWinnersInCycle >= PACKAGE_OF_CYCLE_MAX) {
    return `${PACKAGE_OF_CYCLE_MAX} packages already won Package of the Cycle this cycle.`;
  }
  return null;
}

/** Certificate file name, e.g. "Package of the Cycle - Cycle 2 - Abby Smith.png". */
export function certificateFileName(cycleNumber: number, name: string) {
  const safe = name.replace(/[^\p{L}\p{N} .'-]+/gu, "").trim() || "Member";
  return `Package of the Cycle - Cycle ${cycleNumber} - ${safe}.png`;
}
