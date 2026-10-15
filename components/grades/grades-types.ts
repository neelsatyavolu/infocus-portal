import type { GRADE_WEIGHTS } from "@/src/lib/grading";
import type { GradebookCheckIn, GradebookWeek } from "@/src/lib/student-gradebook";

/** One cycle grade as GET /api/grades/me returns it (dates are ISO strings). */
export type GradeTile = {
  cycleNumber: number;
  focus: string;
  published: boolean;
  effortPoints: number | null;
  teamworkPoints: number | null;
  previousEffortPoints: number | null;
  previousTeamworkPoints: number | null;
  totalPoints: number | null;
  percentage: number | null;
  revised: boolean;
  revisedAt: string | null;
  feedback: string | null;
  reviewProjectId: string | null;
  reviewMediaId: string | null;
};

export type EstimatedPayload = {
  percentage: number | null;
  letter: string | null;
  weights: typeof GRADE_WEIGHTS;
  packages: {
    earned: number;
    possible: number;
    finalCutPoints: Array<number | null>;
    checkInPoints: Array<number | null>;
    checkInPossible?: Array<number | null>;
    livestreamPoints: number | null;
  };
  participation: { earned: number; possible: number };
  portfolio: {
    earned: number;
    possible: number;
    points: number | null;
    max: number;
  };
};

export type GradebookPayload = {
  semester: { label: string; start: string; end: string };
  weeks: GradebookWeek[];
  livestreamHours: number;
  requiredLivestreamHours: number;
  portfolioFeedback: string;
  checkIns: GradebookCheckIn[];
};

export type GradesMePayload = {
  role: "ASSOCIATE_PRODUCER" | "EXECUTIVE_PRODUCER" | "SUPER_ADMIN" | "ADVISER" | null;
  isAdmin: boolean;
  summary: {
    publishedCycleCount: number;
    averageTotal: number | null;
    averagePercentage: number | null;
    extensionsRemaining: number | null;
  };
  estimated?: EstimatedPayload;
  cycles: GradeTile[];
  gradebook?: GradebookPayload;
};

export type Totals = { earned: number; possible: number };
