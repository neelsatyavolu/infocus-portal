import type { GradeScoreState, PackageCategory } from "@prisma/client";
import { brainstormMaterialsReady } from "@/src/lib/package-brainstorm";

/**
 * The five stages a package moves through in a cycle. Only the first four are
 * check-ins: the final cut is the graded deliverable, worth 50 points on its own.
 */
export const PACKAGE_STAGES = [
  "pitching",
  "proofOfContact",
  "aRollBRoll",
  "initialCut",
  "finalCut"
] as const;

export type PackageStage = (typeof PACKAGE_STAGES)[number];

export type CheckInStage = Exclude<PackageStage, "finalCut">;

export const CHECK_IN_STAGES: readonly CheckInStage[] = [
  "pitching",
  "proofOfContact",
  "aRollBRoll",
  "initialCut"
];

export type CheckInScores = Record<CheckInStage, number | GradeScoreState | null>;
export const CHECK_IN_STATE_FIELDS = {
  pitching: "pitchingState",
  proofOfContact: "proofOfContactState",
  aRollBRoll: "aRollBRollState",
  initialCut: "initialCutState"
} as const;

export const CHECK_IN_STATE_SELECT = {
  pitchingState: true, proofOfContactState: true, aRollBRollState: true, initialCutState: true
} as const;
export const CHECK_IN_SCORE_FIELDS = {
  pitching: "pitchingPoints",
  proofOfContact: "proofOfContactPoints",
  aRollBRoll: "aRollBRollPoints",
  initialCut: "initialCutPoints"
} as const;

export function checkInOverrides(grade: {
  pitchingState?: GradeScoreState | null;
  proofOfContactState?: GradeScoreState | null;
  aRollBRollState?: GradeScoreState | null;
  initialCutState?: GradeScoreState | null;
  pitchingPoints?: number | null;
  proofOfContactPoints?: number | null;
  aRollBRollPoints?: number | null;
  initialCutPoints?: number | null;
} | null | undefined): CheckInScores {
  return {
    pitching: grade?.pitchingState ?? grade?.pitchingPoints ?? null,
    proofOfContact: grade?.proofOfContactState ?? grade?.proofOfContactPoints ?? null,
    aRollBRoll: grade?.aRollBRollState ?? grade?.aRollBRollPoints ?? null,
    initialCut: grade?.initialCutState ?? grade?.initialCutPoints ?? null
  };
}

export const POINTS_PER_CHECK_IN = 5;
export const MAX_CHECK_IN_POINTS_PER_CYCLE = CHECK_IN_STAGES.length * POINTS_PER_CHECK_IN;

export const PACKAGE_STAGE_LABELS: Record<PackageStage, string> = {
  pitching: "Package Pitching",
  proofOfContact: "Brainstorming & Proof of Contact",
  aRollBRoll: "A-roll/B-roll",
  initialCut: "Initial Cut",
  finalCut: "Final Cut"
};

export const GROUP_STAGE_SLUGS = ["pitching", "brainstorming", "a-roll", "initial-cut", "final-cut"] as const;
export type GroupStageSlug = (typeof GROUP_STAGE_SLUGS)[number];

export const PACKAGE_STAGE_TO_SLUG: Record<PackageStage, GroupStageSlug> = {
  pitching: "pitching",
  proofOfContact: "brainstorming",
  aRollBRoll: "a-roll",
  initialCut: "initial-cut",
  finalCut: "final-cut"
};

export const SLUG_TO_PACKAGE_STAGE: Record<GroupStageSlug, PackageStage> = {
  pitching: "pitching",
  brainstorming: "proofOfContact",
  "a-roll": "aRollBRoll",
  "initial-cut": "initialCut",
  "final-cut": "finalCut"
};

export const GROUP_STAGE_TAB_LABELS: Record<GroupStageSlug, string> = {
  pitching: "Pitch",
  brainstorming: "Contact",
  "a-roll": "A/B-roll",
  "initial-cut": "Initial",
  "final-cut": "Final"
};

export const GROUP_NAV_SLUGS = [
  "pitching",
  "brainstorming",
  "a-roll",
  "initial-stage-1",
  "initial-stage-2",
  "initial-stage-3",
  "final-cut"
] as const;
export type GroupNavSlug = (typeof GROUP_NAV_SLUGS)[number];

export const GROUP_NAV_TAB_LABELS: Record<GroupNavSlug, string> = {
  pitching: "Pitch",
  brainstorming: "Contact",
  "a-roll": "A/B-roll",
  "initial-stage-1": "Initial 1",
  "initial-stage-2": "Initial 2",
  "initial-stage-3": "Initial 3",
  "final-cut": "Final"
};

export function isGroupStageSlug(value: string): value is GroupStageSlug {
  return (GROUP_STAGE_SLUGS as readonly string[]).includes(value);
}

export function isGroupNavSlug(value: string): value is GroupNavSlug {
  return (GROUP_NAV_SLUGS as readonly string[]).includes(value);
}

export function initialReviewStageFromSlug(slug: string): 1 | 2 | 3 | null {
  if (slug === "initial-stage-1") return 1;
  if (slug === "initial-stage-2") return 2;
  if (slug === "initial-stage-3") return 3;
  return null;
}

export function workspaceSlugFromNav(slug: GroupNavSlug): GroupStageSlug {
  switch (slug) {
    case "initial-stage-1":
    case "initial-stage-2":
    case "initial-stage-3":
      return "initial-cut";
    default:
      return slug;
  }
}

export const PACKAGE_CATEGORY_LABELS: Record<PackageCategory, string> = {
  NEWS: "News",
  FEATURE: "Feature",
  COMMENTARY: "Commentary"
};

export type CheckInCycleInput = {
  now: Date;
  dates: Partial<Record<CheckInStage, Date | null | undefined>>;
  submitted: Partial<Record<CheckInStage, boolean>>;
  approved: Partial<Record<CheckInStage, boolean>>;
  overrides?: Partial<CheckInScores>;
};

export type CheckInCycleGrade = {
  /** Null until at least one check-in deadline has passed. */
  earned: number | null;
  /** 5 × released stages. 0 when nothing is released yet. */
  possible: number;
  /** True when that stage is released and earned the 5 points. */
  stages: Record<CheckInStage, boolean>;
};

export type StageCompletion = Partial<Record<PackageStage, boolean>>;

/** A check-in grade posts once its cycle date has arrived (UTC midnight). */
export function checkInDeadlinePassed(deadline: Date | null | undefined, now: Date) {
  return Boolean(deadline && deadline.getTime() <= now.getTime());
}

/**
 * Per-stage check-in credit after each deadline.
 * Submitted materials earn 5; missing work is 0. A-roll/B-roll requires approval.
 * Producer approval still counts if the upload heuristic missed the work.
 */
export function checkInGradeForCycle(input: CheckInCycleInput): CheckInCycleGrade {
  const stages: Record<CheckInStage, boolean> = {
    pitching: false,
    proofOfContact: false,
    aRollBRoll: false,
    initialCut: false
  };
  let earned = 0;
  let possible = 0;

  for (const stage of CHECK_IN_STAGES) {
    if (!checkInDeadlinePassed(input.dates[stage], input.now)) {
      continue;
    }

    const override = input.overrides?.[stage];
    if (typeof override === "string") continue;
    possible += POINTS_PER_CHECK_IN;
    const credit = stage === "aRollBRoll"
      ? Boolean(input.approved[stage])
      : Boolean(input.submitted[stage] || input.approved[stage]);
    const points = override ?? (credit ? POINTS_PER_CHECK_IN : 0);
    stages[stage] = points === POINTS_PER_CHECK_IN;
    earned += points;
  }

  return {
    earned: possible === 0 ? null : earned,
    possible,
    stages
  };
}

export type CheckInProgressSnapshot = {
  pitching: boolean;
  proofOfContact: boolean;
  aRollBRoll: boolean;
  initialCut: boolean;
  brainstormDocUrl: string;
  proofOfContactCount: number;
  hasARollMedia: boolean;
  hasInitialCutMedia: boolean;
};

/** Check-in grade from a package-progress row. Pitching has no upload. */
export function checkInGradeForProgress(input: {
  now: Date;
  dates: CheckInCycleInput["dates"];
  row: CheckInProgressSnapshot | null | undefined;
  overrides?: Partial<CheckInScores>;
}): CheckInCycleGrade {
  const row = input.row;
  return checkInGradeForCycle({
    now: input.now,
    dates: input.dates,
    overrides: input.overrides,
    submitted: {
      // Pitching has no upload. Being on the package is the turn-in; producer
      // approval still counts if they were marked without a row snapshot.
      pitching: Boolean(row),
      proofOfContact: brainstormMaterialsReady(row?.proofOfContactCount ?? 0, row?.brainstormDocUrl ?? ""),
      aRollBRoll: Boolean(row?.hasARollMedia),
      initialCut: Boolean(row?.hasInitialCutMedia)
    },
    approved: {
      pitching: Boolean(row?.pitching),
      proofOfContact: Boolean(row?.proofOfContact),
      aRollBRoll: Boolean(row?.aRollBRoll),
      initialCut: Boolean(row?.initialCut)
    }
  });
}

/** Preserve N/A for future stages, including when an override is saved. */
export function releasedCheckInScores(
  grade: CheckInCycleGrade,
  dates: CheckInCycleInput["dates"],
  now: Date,
  overrides: Partial<CheckInScores> = {}
): CheckInScores {
  return Object.fromEntries(CHECK_IN_STAGES.map((stage) => [
    stage,
    checkInDeadlinePassed(dates[stage], now)
      ? overrides[stage] ?? (grade.stages[stage] ? POINTS_PER_CHECK_IN : 0)
      : null
  ])) as CheckInScores;
}

export function cycleCheckInDates(cycle: {
  pitchingDate?: Date | null;
  proofOfContactDate?: Date | null;
  aRollBRollDate?: Date | null;
  initialCutDate?: Date | null;
}): CheckInCycleInput["dates"] {
  return {
    pitching: cycle.pitchingDate,
    proofOfContact: cycle.proofOfContactDate,
    aRollBRoll: cycle.aRollBRollDate,
    initialCut: cycle.initialCutDate
  };
}

/** Sum released check-in grades. Null earned when nothing has been released. */
export function sumReleasedCheckIns(grades: readonly CheckInCycleGrade[]): {
  earned: number | null;
  possible: number;
} {
  let earned = 0;
  let possible = 0;
  for (const grade of grades) {
    if (grade.earned === null) continue;
    earned += grade.earned;
    possible += grade.possible;
  }
  return { earned: possible === 0 ? null : earned, possible };
}

/**
 * Grade Editor / totals: semester check-in max (S1 reporters = 60) while only
 * docking stages whose deadline passed without a turn-in. Unreleased work is
 * full credit so 10/10 due today reads as 60/60, not 10/60.
 */
export function padCheckInsToSemesterMax(input: {
  releasedEarned: number | null;
  releasedPossible: number;
  semesterMax: number;
}): { earned: number | null; possible: number | null } {
  if (input.semesterMax <= 0 || input.releasedPossible <= 0) {
    return { earned: null, possible: null };
  }
  const earned = input.releasedEarned ?? 0;
  const missed = Math.max(0, input.releasedPossible - earned);
  return {
    earned: input.semesterMax - missed,
    possible: input.semesterMax
  };
}

/**
 * First incomplete package stage, or Final Cut once every stage is done.
 * Groups uses this so opening a tile lands on the work that is still pending.
 */
export function pendingPackageStage(completion: StageCompletion): PackageStage {
  return PACKAGE_STAGES.find((stage) => !completion[stage]) ?? "finalCut";
}

export function pendingGroupStageSlug(completion: StageCompletion): GroupStageSlug {
  return PACKAGE_STAGE_TO_SLUG[pendingPackageStage(completion)];
}

export type GroupNavState = {
  pitching: boolean;
  proofOfContact: boolean;
  aRollBRoll: boolean;
  finalCut?: boolean;
  approvalStage?: string | null;
};

/** Keep revision work at the stage that requested it after the chain resets to Draft. */
export function effectiveGroupApprovalStage(
  approvalStage: string | null | undefined,
  initialCutNeedsRevisions: boolean,
  initialCutReviewStage: string | null | undefined
) {
  return approvalStage === "DRAFT" && initialCutNeedsRevisions && initialCutReviewStage
    ? initialCutReviewStage
    : approvalStage ?? "DRAFT";
}

/** Groups nav follows the approval chain, not the initial-cut check-in flag. */
export function pendingGroupNavSlug(input: GroupNavState): GroupNavSlug {
  if (!input.pitching) return "pitching";
  if (!input.proofOfContact) return "brainstorming";
  if (!input.aRollBRoll) return "a-roll";
  const stage = input.approvalStage ?? "DRAFT";
  if (stage === "ADVISER_REVIEW") return "initial-stage-2";
  if (stage === "EXECUTIVE_REVIEW") return "initial-stage-3";
  if (stage === "APPROVED") return "final-cut";
  return "initial-stage-1";
}

export function groupNavTabDone(slug: GroupNavSlug, input: GroupNavState): boolean {
  const stage = input.approvalStage ?? "DRAFT";
  switch (slug) {
    case "pitching":
      return input.pitching;
    case "brainstorming":
      return input.proofOfContact;
    case "a-roll":
      return input.aRollBRoll;
    case "initial-stage-1":
      return stage === "ADVISER_REVIEW" || stage === "EXECUTIVE_REVIEW" || stage === "APPROVED";
    case "initial-stage-2":
      return stage === "EXECUTIVE_REVIEW" || stage === "APPROVED";
    case "initial-stage-3":
      return stage === "APPROVED";
    case "final-cut":
      return Boolean(input.finalCut);
  }
}

/**
 * Check-in credit is earned per completed stage, so a student who misses an early
 * stage but completes later ones still banks the stages they did finish.
 */
export function checkInPointsForCycle(completion: StageCompletion) {
  return CHECK_IN_STAGES.reduce(
    (total, stage) => (completion[stage] ? total + POINTS_PER_CHECK_IN : total),
    0
  );
}

export function completedCheckInCount(completion: StageCompletion) {
  return CHECK_IN_STAGES.filter((stage) => completion[stage]).length;
}

export function parsePackageCategory(value: string | null | undefined): PackageCategory | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized.includes("news")) return "NEWS";
  if (normalized.includes("feature")) return "FEATURE";
  if (normalized.includes("comment") || normalized.includes("opinion")) return "COMMENTARY";

  return null;
}

/**
 * Man-on-the-street packages cannot be a student's primary package for a cycle;
 * producing one requires contacting a producer first.
 */
const MAN_ON_THE_STREET_PATTERNS = [
  "man on the street",
  "man-on-the-street",
  "mots",
  "woman on the street",
  "person on the street"
];

export function isManOnTheStreetTopic(topic: string | null | undefined) {
  if (!topic) {
    return false;
  }

  const normalized = topic.trim().toLowerCase();
  return MAN_ON_THE_STREET_PATTERNS.some((pattern) => normalized.includes(pattern));
}
