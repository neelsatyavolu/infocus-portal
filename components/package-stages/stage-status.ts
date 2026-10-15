import { approvalProgressLabel, executiveWaitPill } from "@/src/lib/package-approval";
import type { CycleStageSlug } from "@/src/lib/package-cycle-gates";
import {
  CYCLE_STAGE_STATUS_CLASS,
  CYCLE_STAGE_STATUS_LABELS,
  cycleStageStatus,
  type CycleStageStatus
} from "@/src/lib/package-stage-status";
import { toneFromStatusClass, type StatusTone } from "@/components/kit/tone";
import type { StageView } from "@/components/package-stages/types";

/**
 * The stage's status for this viewer. Students see APPROVED instead of QUEUED on Final Cut
 * (showQueued is producer-only).
 */
export function stageStatusFor(slug: CycleStageSlug, view: StageView): CycleStageStatus | null {
  const row = view.row;
  if (!row) return null;
  const mediaCount = (view.media ?? []).length;
  return cycleStageStatus(
    slug,
    {
      proofOfContact: row.proofOfContact,
      proofCount: 0,
      brainstormDocUrl: "",
      brainstormNeedsChanges: false,
      aRollBRoll: row.aRollBRoll,
      aRollHasMedia: slug === "a-roll" && mediaCount > 0,
      aRollNeedsChanges: Boolean(row.aRollNeedsChanges),
      initialCut: row.initialCut,
      initialCutHasMedia: slug === "initial-cut" && mediaCount > 0,
      awaitingRevisedInitialCut: row.awaitingRevisedInitialCut,
      initialCutNeedsRevisions: Boolean(row.initialCutNeedsRevisions),
      approvalStage: row.approvalStage,
      finalCutHasMedia: slug === "final-cut" && mediaCount > 0,
      queuedForAir: Boolean(row.queuedForAirAt)
    },
    { showQueued: view.isProducer }
  );
}

/** Tag words for a stage status; Stage 3 says how many executive sign-offs are left. */
export function stageStatusLabel(status: CycleStageStatus, remainingExecutiveSignoffs?: number | null) {
  if (status === "stage-3" && remainingExecutiveSignoffs != null) {
    return executiveWaitPill(remainingExecutiveSignoffs) ?? CYCLE_STAGE_STATUS_LABELS[status];
  }
  return CYCLE_STAGE_STATUS_LABELS[status];
}

export function stageStatusTone(status: CycleStageStatus): StatusTone {
  return toneFromStatusClass(CYCLE_STAGE_STATUS_CLASS[status]);
}

/** Initial Cut approval progress ("Waiting for the adviser (Stage 2)"); null on other stages. */
export function initialCutProgressLabel(view: StageView): string | null {
  const row = view.row;
  if (view.slug !== "initial-cut" || !row) return null;
  if (row.awaitingRevisedInitialCut && !row.initialCutNeedsRevisions) {
    return "Approved in Stage 1 · Awaiting revised upload";
  }
  return approvalProgressLabel(
    row.initialCutNeedsRevisions ? "DRAFT" : row.approvalStage,
    row.remainingExecutiveSignoffs
  );
}

/** "Unlocks when Brainstorming is approved." and so on, for a locked stage. */
export function lockedStageSentence(slug: CycleStageSlug) {
  if (slug === "a-roll") return "Unlocks when Brainstorming is approved.";
  if (slug === "initial-cut") return "Unlocks when A-roll/B-roll is approved.";
  return "Unlocks when your Initial Cut is approved.";
}

/**
 * The one next-step sentence under a student's stage title. It says what to do (or that there is
 * nothing to do yet); the status tag and the Initial Cut approval path already say where it is.
 */
export function studentNextStep(
  slug: CycleStageSlug,
  status: CycleStageStatus | null,
  options: { hasFinalCut?: boolean } = {}
) {
  if (status === "locked") return lockedStageSentence(slug);
  if (slug === "a-roll") {
    if (status === "needs-revisions")
      return "Your producer asked for changes. Read the feedback, then upload new clips.";
    if (status === "submitted") return "Waiting for your producer to approve.";
    if (status === "approved") return "Approved. Uploads are closed unless your producer asks for changes.";
    return "Upload your A-roll and B-roll clips for your producer to review.";
  }
  if (slug === "initial-cut") {
    if (status === "pending") return "Upload your Initial Cut. Your producer reviews it first.";
    if (status === "needs-revisions") return "Changes were requested. Read the feedback, then upload a new version.";
    if (status === "stage-1-approved") return "Upload your revised version to move on to Stage 2.";
    if (status === "approved") {
      return options.hasFinalCut
        ? "Approved. Nothing more to do for this stage."
        : "Approved for Final Cut. Next, upload your Final Cut with a headline and a toss for the anchors.";
    }
    return "Nothing to do until a reviewer asks for changes. Feedback shows up here.";
  }
  if (status === "submitted") return "Turned in. Your executive producers grade it next.";
  if (status === "approved") return "Approved. Nothing more to do for this stage.";
  return "Upload your Final Cut with a headline and a toss for the anchors.";
}

/**
 * The one progress line in the producer decision bar. Null before anything is uploaded (the
 * media panel's empty state already says so) and once A-roll/B-roll is approved (the stage bar
 * above already says so).
 */
export function producerProgressLine(
  slug: CycleStageSlug,
  status: CycleStageStatus | null,
  view: StageView,
  progressLabel: string | null
) {
  if ((view.media ?? []).length === 0) return null;
  if (slug === "initial-cut") return progressLabel;
  if (slug === "final-cut") {
    return view.row?.queuedForAirAt ? "Queued for an upcoming show." : "Send it when it is ready to air.";
  }
  if (status === "needs-revisions") return "Changes requested. Waiting for new footage from the group.";
  if (status === "submitted") return "Footage is in. Watch the clips, then approve or request changes.";
  return null;
}

const MEDIA_STATUS_LABELS: Record<string, string> = {
  READY: "Ready",
  PROCESSING: "Processing",
  UPLOADING: "Uploading",
  FAILED: "Failed"
};

/** READY → Ready, PROCESSING → Processing (the raw enum never reaches the page). */
export function mediaStatusLabel(status: string) {
  const known = MEDIA_STATUS_LABELS[status];
  if (known) return known;
  const lower = status.toLowerCase().replace(/_/g, " ");
  return lower ? lower.charAt(0).toUpperCase() + lower.slice(1) : "";
}

export type ApprovalStepState = "done" | "current" | "upcoming";

export type ApprovalStep = {
  key: "stage-1" | "stage-2" | "stage-3";
  number: 1 | 2 | 3;
  label: string;
  state: ApprovalStepState;
  /** Caps state words ("DONE", "REVIEWING", "NEEDS REVISIONS", "2 EXECS LEFT"); null when upcoming. */
  stateLabel: string | null;
  tone: StatusTone;
};

const APPROVAL_STEP_LABELS = ["Producer review", "Adviser review", "Executive sign-off"] as const;

const CURRENT_INDEX: Record<string, number> = {
  DRAFT: 0,
  ASSOCIATE_REVIEW: 0,
  ADVISER_REVIEW: 1,
  EXECUTIVE_REVIEW: 2,
  APPROVED: 3
};

/**
 * The Initial Cut approval path (Stage 1 producer → Stage 2 adviser → Stage 3 executives) as three
 * steps. Before any cut is uploaded every step is upcoming.
 */
export function approvalPathSteps(input: {
  approvalStage: string | null | undefined;
  hasMedia: boolean;
  needsRevisions: boolean;
  awaitingRevisedInitialCut: boolean;
  remainingExecutiveSignoffs?: number | null;
}): ApprovalStep[] {
  const current = input.hasMedia ? (CURRENT_INDEX[input.approvalStage ?? ""] ?? -1) : -1;
  return APPROVAL_STEP_LABELS.map((label, index) => {
    const number = (index + 1) as 1 | 2 | 3;
    const key = `stage-${number}` as ApprovalStep["key"];
    if (current < 0 || index > current) {
      return { key, number, label, state: "upcoming", stateLabel: null, tone: "muted" };
    }
    if (index < current) {
      return { key, number, label, state: "done", stateLabel: "Done", tone: "success" };
    }
    if (input.needsRevisions || input.approvalStage === "DRAFT") {
      return { key, number, label, state: "current", stateLabel: "Needs revisions", tone: "danger" };
    }
    if (index === 0 && input.awaitingRevisedInitialCut) {
      return {
        key,
        number,
        label,
        state: "current",
        stateLabel: "Approved · awaiting revised upload",
        tone: "success"
      };
    }
    if (index === 2 && input.remainingExecutiveSignoffs != null) {
      const left = executiveWaitPill(input.remainingExecutiveSignoffs);
      if (left) return { key, number, label, state: "current", stateLabel: left, tone: "review" };
    }
    return { key, number, label, state: "current", stateLabel: "Reviewing", tone: "review" };
  });
}
