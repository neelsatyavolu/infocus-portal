import type { GradeScoreState } from "@prisma/client";
import type { CheckInScores } from "@/src/lib/package-stages";

/** Payload shapes for GET/POST /api/grades/admin, as the Grade Editor reads them. */

export type CycleTab = {
  cycleNumber: number;
  focus: string;
  finalCutDate: string | null;
};

export type CycleAverage = {
  cycleNumber: number;
  averageTotal: number | null;
  averagePercentage: number | null;
  publishedCount: number;
};

export type GradeRow = {
  finalCutState: GradeScoreState | null;
  /** Deadline passed with no approved Final Cut: counts as 0 until a score is entered. */
  finalCutMissing: boolean;
  checkInScores: CheckInScores;
  checkInOverrides: CheckInScores;
  userId: string;
  name: string | null;
  email: string | null;
  effortPoints: number | null;
  /**
   * The saved score after any late penalty (what the student gradebook counts), or null when
   * there is no saved score. Cleared on a local edit to the score or turned-in date until the save returns.
   */
  officialPoints: number | null;
  teamworkPoints: number | null;
  previousEffortPoints: number | null;
  previousTeamworkPoints: number | null;
  totalPoints: number | null;
  percentage: number | null;
  revised: boolean;
  revisedAt: string | null;
  feedback: string;
  turnedInDate: string | null;
  freeExtensionDays: number;
  extensionDetails: {
    calculatedDays: number;
    freeDays: number;
    chargedDays: number;
    exempt: boolean;
  };
  published: boolean;
  publishedAt: string | null;
  publicationHistory: Array<{
    eventType: "PUBLISHED" | "REVISED";
    occurredAt: string | null;
  }>;
  extensionsRemaining: number;
};

export type AdminGradesPayload = {
  activeCycleNumber: number;
  cycles: CycleTab[];
  cycleAverages: CycleAverage[];
  activeCycleAverage: CycleAverage | null;
  rows: GradeRow[];
};

export type TotalsCycleEntry = {
  finalCutState: GradeScoreState | null;
  cycleNumber: number;
  totalPoints: number | null;
  /** totalPoints is the automatic 0 for a missed Final Cut, not an entered score. */
  missing: boolean;
};

export type TotalsRow = {
  participationEarned: number;
  participationPossible: number;
  userId: string;
  name: string | null;
  email: string | null;
  notes: string;
  cycleTotals: TotalsCycleEntry[];
  checkInPoints: number | null;
  checkInPossible: number | null;
  livestreamPoints: number | null;
  livestreamHours: number;
  portfolioPoints: number | null;
};

export type TotalsPayload = {
  cycles: CycleTab[];
  checkInPossible: number;
  totalsRows: TotalsRow[];
};

export type MissingStatus = "not_entered" | "unpublished";

export type MissingEntry = {
  cycleNumber: number;
  status: MissingStatus;
};

export type MissingPerson = {
  userId: string;
  name: string | null;
  email: string | null;
  missing: MissingEntry[];
};

export type MissingPayload = {
  cycles: { cycleNumber: number; focus: string }[];
  consideredCycleNumbers: number[];
  people: { userId: string; name: string | null; email: string | null }[];
  missingReport: MissingPerson[];
};

export type GradeMutationPayload = Pick<
  GradeRow,
  | "finalCutState"
  | "effortPoints"
  | "officialPoints"
  | "teamworkPoints"
  | "previousEffortPoints"
  | "previousTeamworkPoints"
  | "totalPoints"
  | "percentage"
  | "revised"
  | "revisedAt"
  | "feedback"
  | "turnedInDate"
  | "freeExtensionDays"
  | "extensionDetails"
  | "published"
  | "publishedAt"
  | "extensionsRemaining"
>;

export type ViewMode = "cycle" | "total" | "student";
export type SortBy = "firstName" | "lastName";

/** Which rows of a cycle the table shows. */
export type CycleFilter = "all" | "to-publish" | "not-entered" | "missed" | "republish" | "over-extensions";

export const MAX_PACKAGE_PER_CYCLE = 50;
export const MAX_CHECK_INS_PER_CYCLE = 20;
export const MAX_LIVESTREAM = 40;
export const MAX_FINAL = 100;
export const MAX_FEEDBACK_LENGTH = 2000;
export const MAX_NOTES_LENGTH = 5000;

export const CHECK_IN_LABELS = {
  pitching: "Pitching",
  proofOfContact: "PoC",
  aRollBRoll: "A-roll/B-roll",
  initialCut: "Initial Cut"
} as const;

export const CHECK_IN_SHORT_LABELS = {
  pitching: "Pitch",
  proofOfContact: "PoC",
  aRollBRoll: "A/B-roll",
  initialCut: "Initial"
} as const;

export const FINAL_CUT_REQUIRED_HINT = "Set this cycle's Final Cut date in Cycle Dates first";
export const PARTICIPATION_HINT =
  "Graded participation from weeks ending before this Monday, Pacific time. Ungraded days are excluded.";
export const SCORE_GRAMMAR_HINT = "Enter points, - for ungraded, or \\ for exempt";
/** The late and second-revision rules, shown in the legend and on the phone row sheet. */
export const LATE_POLICY_HINT = "Late: 20% off, 30% after 14 days. A second revision after a grade below 75% is capped at 37/50.";
