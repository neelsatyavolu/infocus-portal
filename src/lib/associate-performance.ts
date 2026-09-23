import { combineAssociateScore, type groupProgress } from "@/src/lib/associate-score-components";
import type { FeedbackNote, FeedbackQuality } from "@/src/lib/associate-feedback-quality";
import type { GroupProducerFeedback } from "@/src/lib/producer-feedback";
export const ASSOCIATE_STAGE_LABELS = {
  brainstorming: "Brainstorming", "a-roll": "A-roll / B-roll", "initial-cut": "Initial cut"
} as const;
export type AssociateReviewStage = keyof typeof ASSOCIATE_STAGE_LABELS;
export type AssociateStageSample = {
  rowId: string;
  topic: string;
  stage: AssociateReviewStage;
  submittedAt: string | null;
  respondedAt: string | null;
  hasFeedback: boolean;
  historicalUnknown: boolean;
  estimated: boolean;
};

export function scoreAssociate(samples: AssociateStageSample[], now = new Date()) {
  const hours = (date: string) => (now.getTime() - new Date(date).getTime()) / 3_600_000;
  const known = samples.filter((s) => !s.historicalUnknown && s.submittedAt && hours(s.submittedAt) >= 0);
  const responseHours = (s: AssociateStageSample) => {
    if (!s.submittedAt || !s.respondedAt || hours(s.respondedAt) < 0) return null;
    const elapsed = (Date.parse(s.respondedAt) - Date.parse(s.submittedAt)) / 3_600_000;
    return elapsed >= 0 ? elapsed : null;
  };
  const hasResponse = (s: AssociateStageSample) => !!s.respondedAt && hours(s.respondedAt) >= 0
    && (!s.submittedAt || responseHours(s) !== null);
  const timedEligible = known.filter((s) => responseHours(s) !== null || hours(s.submittedAt!) >= 48);
  const eligible = samples.filter((s) => hasResponse(s) || timedEligible.includes(s));
  const reviewed = eligible.filter(hasResponse).length;
  const durations = timedEligible.map(responseHours).filter((h): h is number => h !== null).sort((a, b) => a - b);
  const percent = (count: number, total: number) => total ? count / total * 100 : null;
  const responsiveness = percent(durations.filter((h) => h <= 48).length, timedEligible.length);
  const reviewCoverage = percent(reviewed, eligible.length);
  const groups = new Set(eligible.map((s) => s.rowId));
  const feedbackGroups = new Set(eligible.filter((s) => s.hasFeedback).map((s) => s.rowId));
  const feedbackCoverage = percent(feedbackGroups.size, groups.size);
  const mid = Math.floor(durations.length / 2);
  return {
    ...combineAssociateScore({ responsiveness, reviewCoverage, feedbackCoverage }),
    responsiveness, reviewCoverage, feedbackCoverage,
    medianHours: durations.length ? (durations[Math.floor((durations.length - 1) / 2)] + durations[mid]) / 2 : null,
    reviewed, eligible: eligible.length,
    pending: known.filter((s) => responseHours(s) === null).length,
    overdue: timedEligible.length - durations.length,
    missingTiming: samples.filter((s) => hasResponse(s) && (!s.submittedAt || s.historicalUnknown)).length,
    unknown: samples.filter((s) => !hasResponse(s) && (s.historicalUnknown || !s.submittedAt)).length
  };
}

export type AssociatePerformance = {
  userId: string;
  name: string;
  assignedGroups: number;
  metrics: ReturnType<typeof scoreAssociate>;
  samples: AssociateStageSample[];
  feedback: FeedbackNote[];
  quality: FeedbackQuality;
  progress: { score: number | null; groups: Array<ReturnType<typeof groupProgress> & { rowId: string; topic: string }> };
  groupFeedback: { visible: boolean; score: number | null; reviews: GroupProducerFeedback[] };
};
export type AssociatesPayload = { cycleNumber: number; associates: AssociatePerformance[] };
