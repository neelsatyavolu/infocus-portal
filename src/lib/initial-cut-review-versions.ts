export type CutVersionRef = {
  id: string;
  versionNumber: number;
  createdAt: Date | string;
};

export type CutSignoffRef = {
  stage: string;
  approved: boolean;
  createdAt: Date | string;
};

function time(value: Date | string) {
  return new Date(value).getTime();
}

/** Stage that requested revisions on the current upload, not an older cut. */
export function currentCutRevisionStage(
  cut: { mediaItemId: string; createdAt: Date | string } | null,
  signoffs: Array<CutSignoffRef & { mediaItemId: string | null }>
): string | null {
  if (!cut) return null;
  const latest = signoffs
    .filter((entry) => entry.mediaItemId === cut.mediaItemId && time(entry.createdAt) >= time(cut.createdAt))
    .sort((left, right) => time(right.createdAt) - time(left.createdAt))[0];
  return latest && !latest.approved ? latest.stage : null;
}

function latestApprove(signoffs: CutSignoffRef[], stage: string) {
  return signoffs
    .filter((entry) => entry.stage === stage && entry.approved)
    .sort((left, right) => time(right.createdAt) - time(left.createdAt))[0] ?? null;
}

function latestVersionAtOrBefore(versions: CutVersionRef[], at: Date | string) {
  const cutoff = time(at);
  const eligible = versions
    .filter((version) => time(version.createdAt) <= cutoff)
    .sort((left, right) => left.versionNumber - right.versionNumber);
  return eligible[eligible.length - 1] ?? null;
}

/**
 * Stage 1: versions through the cut the AP approved.
 * Stage 2: that approved cut plus anything uploaded after.
 * Stage 3: the Stage 2 approved cut plus anything uploaded after.
 */
export function versionsForReviewStage<T extends CutVersionRef>(
  versions: T[],
  signoffs: CutSignoffRef[],
  reviewStage: 1 | 2 | 3
): T[] {
  const sorted = [...versions].sort((left, right) => left.versionNumber - right.versionNumber);
  const newestFirst = () => [...sorted].reverse();

  if (reviewStage === 1) {
    const ap = latestApprove(signoffs, "ASSOCIATE_REVIEW");
    if (!ap) return newestFirst();
    const last = latestVersionAtOrBefore(sorted, ap.createdAt);
    if (!last) return newestFirst();
    return sorted.filter((version) => version.versionNumber <= last.versionNumber).reverse();
  }

  const floorStage = reviewStage === 2 ? "ASSOCIATE_REVIEW" : "ADVISER_REVIEW";
  const signoff = latestApprove(signoffs, floorStage);
  if (!signoff) return [];
  const floor = latestVersionAtOrBefore(sorted, signoff.createdAt);
  if (!floor) return [];
  return sorted.filter((version) => version.versionNumber >= floor.versionNumber).reverse();
}

const APPROVE_STAGE_NUMBER = [
  { n: 3 as const, stage: "EXECUTIVE_REVIEW" },
  { n: 2 as const, stage: "ADVISER_REVIEW" },
  { n: 1 as const, stage: "ASSOCIATE_REVIEW" }
];

/** Highest approval-chain stage at which this version was the current cut. */
export function versionApprovedInStage(
  versionId: string,
  versions: CutVersionRef[],
  signoffs: CutSignoffRef[]
): 1 | 2 | 3 | null {
  for (const { n, stage } of APPROVE_STAGE_NUMBER) {
    const signoff = latestApprove(signoffs, stage);
    if (!signoff) continue;
    const floor = latestVersionAtOrBefore(versions, signoff.createdAt);
    if (floor?.id === versionId) return n;
  }
  return null;
}
