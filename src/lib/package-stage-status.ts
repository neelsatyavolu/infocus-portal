import { brainstormMaterialsReady } from "@/src/lib/package-brainstorm";
import { parseApprovalStage, studentStageUnlocked, type CycleStageSlug } from "@/src/lib/package-cycle-gates";
import type { StudentFeedbackStage } from "@/src/lib/package-stage-comments";

export const CYCLE_STAGE_STATUSES = [
  "approved",
  "stage-1-approved",
  "submitted",
  "queued",
  "needs-revisions",
  "stage-2",
  "stage-3",
  "pending",
  "locked"
] as const;
export type CycleStageStatus = (typeof CYCLE_STAGE_STATUSES)[number];

export const CYCLE_STAGE_STATUS_LABELS: Record<CycleStageStatus, string> = {
  approved: "APPROVED",
  "stage-1-approved": "APPROVED IN STAGE 1",
  submitted: "SUBMITTED",
  queued: "QUEUED",
  "needs-revisions": "REVISIONS",
  "stage-2": "STAGE 2",
  "stage-3": "STAGE 3",
  pending: "PENDING",
  locked: "LOCKED"
};

export const CYCLE_STAGE_STATUS_CLASS: Record<CycleStageStatus, string> = {
  approved: "status-approved",
  "stage-1-approved": "status-approved",
  submitted: "status-warn",
  queued: "status-review",
  "needs-revisions": "status-danger",
  "stage-2": "status-review",
  "stage-3": "status-review",
  pending: "status-neutral",
  locked: "status-neutral"
};

export type CycleStageStatusInput = {
  proofOfContact: boolean;
  proofCount: number;
  brainstormDocUrl: string;
  brainstormNeedsChanges: boolean;
  aRollBRoll: boolean;
  aRollHasMedia: boolean;
  aRollNeedsChanges: boolean;
  initialCut: boolean;
  initialCutHasMedia: boolean;
  awaitingRevisedInitialCut: boolean;
  initialCutNeedsRevisions: boolean;
  approvalStage: string | null;
  finalCutHasMedia: boolean;
  queuedForAir: boolean;
};

function instantMs(value: Date | string | number | null | undefined) {
  if (value == null || value === "") return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Producer brainstorming or A-roll/B-roll feedback is a revision request until they approve,
 * or until students upload new proof or footage after that feedback.
 */
export function stageFeedbackNeedsChanges(
  approved: boolean,
  hasFeedback: boolean,
  latestFeedbackAt?: Date | string | number | null,
  latestUploadAt?: Date | string | number | null
) {
  if (approved || !hasFeedback) return false;
  const feedbackAt = instantMs(latestFeedbackAt);
  const uploadAt = instantMs(latestUploadAt);
  if (feedbackAt == null || uploadAt == null) return true;
  return feedbackAt >= uploadAt;
}

type StageFeedback = Array<{ stage: string; createdAt: Date }>;

function latestDate(dates: Date[]) {
  return dates.reduce<Date | null>((latest, date) => (!latest || date > latest ? date : latest), null);
}

function latestFeedbackAt(comments: StageFeedback, stage: string) {
  return latestDate(comments.filter((comment) => comment.stage === stage).map((comment) => comment.createdAt));
}

/** `stageComments` is producer feedback with approval notes excluded. */
export function brainstormNeedsChanges(row: {
  proofOfContact: boolean;
  stageComments: StageFeedback;
  proofOfContacts: Array<{ updatedAt: Date }>;
}) {
  const feedbackAt = latestFeedbackAt(row.stageComments, "brainstorming");
  return stageFeedbackNeedsChanges(
    row.proofOfContact,
    feedbackAt != null,
    feedbackAt,
    latestDate(row.proofOfContacts.map((proof) => proof.updatedAt))
  );
}

/** Brainstorming and A-roll/B-roll revision flags for one group. */
export function earlyStageNeedsChanges(row: {
  proofOfContact: boolean;
  aRollBRoll: boolean;
  stageComments: StageFeedback;
  proofOfContacts: Array<{ updatedAt: Date }>;
  stageMedia: Array<{ createdAt: Date }>;
}) {
  const aRollFeedbackAt = latestFeedbackAt(row.stageComments, "a-roll");
  return {
    brainstormNeedsChanges: brainstormNeedsChanges(row),
    aRollNeedsChanges: stageFeedbackNeedsChanges(
      row.aRollBRoll,
      aRollFeedbackAt != null,
      aRollFeedbackAt,
      latestDate(row.stageMedia.map((link) => link.createdAt))
    )
  };
}

export function aRollUploadIsNew(
  aRollBRoll: boolean,
  latestFeedbackAt: Date | string | number | null,
  uploadedAt: Date | string | number | null
) {
  const feedbackAt = instantMs(latestFeedbackAt);
  const footageAt = instantMs(uploadedAt);
  return !aRollBRoll && feedbackAt != null && footageAt != null && footageAt > feedbackAt;
}

export function emptyCycleStageStatusInput(): CycleStageStatusInput {
  return {
    proofOfContact: false,
    proofCount: 0,
    brainstormDocUrl: "",
    brainstormNeedsChanges: false,
    aRollBRoll: false,
    aRollHasMedia: false,
    aRollNeedsChanges: false,
    initialCut: false,
    initialCutHasMedia: false,
    awaitingRevisedInitialCut: false,
    initialCutNeedsRevisions: false,
    approvalStage: null,
    finalCutHasMedia: false,
    queuedForAir: false
  };
}

function approval(input: CycleStageStatusInput) {
  const stage = parseApprovalStage(input.approvalStage);
  return stage ? { stage } : null;
}

function unlocked(slug: CycleStageSlug, input: CycleStageStatusInput) {
  return studentStageUnlocked(slug, input, approval(input));
}

export function cycleStageStatus(
  slug: StudentFeedbackStage,
  input: CycleStageStatusInput,
  options?: { showQueued?: boolean }
): CycleStageStatus {
  if (slug === "brainstorming") {
    if (input.proofOfContact) return "approved";
    if (!brainstormMaterialsReady(input.proofCount, input.brainstormDocUrl)) return "pending";
    if (input.brainstormNeedsChanges) return "needs-revisions";
    return "submitted";
  }

  if (slug === "a-roll") {
    if (!unlocked("a-roll", input)) return "locked";
    if (input.aRollBRoll) return "approved";
    if (input.aRollNeedsChanges && input.aRollHasMedia) return "needs-revisions";
    if (input.aRollHasMedia) return "submitted";
    return "pending";
  }

  if (slug === "initial-cut") {
    if (!unlocked("initial-cut", input)) return "locked";
    if (input.initialCutNeedsRevisions) return "needs-revisions";
    if (input.awaitingRevisedInitialCut && input.approvalStage === "ASSOCIATE_REVIEW") return "stage-1-approved";
    if (input.approvalStage === "APPROVED") return "approved";
    if (input.approvalStage === "DRAFT" && input.initialCutHasMedia) return "needs-revisions";
    if (input.approvalStage === "ADVISER_REVIEW" && input.initialCutHasMedia) return "stage-2";
    if (input.approvalStage === "EXECUTIVE_REVIEW" && input.initialCutHasMedia) return "stage-3";
    if (input.initialCutHasMedia) return "submitted";
    return "pending";
  }

  if (!unlocked("final-cut", input)) return "locked";
  if (input.queuedForAir) return options?.showQueued ? "queued" : "approved";
  if (input.finalCutHasMedia) return "submitted";
  return "pending";
}

export function allCycleStageStatuses(
  input: CycleStageStatusInput,
  options?: { showQueued?: boolean }
): Record<StudentFeedbackStage, CycleStageStatus> {
  return {
    brainstorming: cycleStageStatus("brainstorming", input, options),
    "a-roll": cycleStageStatus("a-roll", input, options),
    "initial-cut": cycleStageStatus("initial-cut", input, options),
    "final-cut": cycleStageStatus("final-cut", input, options)
  };
}
