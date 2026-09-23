import type { PackageApprovalStage, PlatformRole } from "@prisma/client";

/**
 * The 2026-27 package approval chain. No stage may be skipped.
 *
 *   Stage 1  the group's assigned producer (AP, or EP standing in) greenlights it
 *   Stage 2  the adviser greenlights it (this is also where class initial-cut
 *            feedback happens)
 *   Stage 3  two executive producers sign off; all three if the package is
 *            flagged controversial
 *
 * Nothing may publish under the InFocus name until the chain completes. Social
 * media is the one exception and is approved directly by the Head of Creative &
 * Content.
 */
export const APPROVAL_STAGE_ORDER: PackageApprovalStage[] = [
  "DRAFT",
  "ASSOCIATE_REVIEW",
  "ADVISER_REVIEW",
  "EXECUTIVE_REVIEW",
  "APPROVED"
];

export const APPROVAL_STAGE_LABELS: Record<PackageApprovalStage, string> = {
  DRAFT: "Draft",
  ASSOCIATE_REVIEW: "Associate producer review",
  ADVISER_REVIEW: "Adviser review",
  EXECUTIVE_REVIEW: "Executive producer sign-off",
  APPROVED: "Approved for final cut"
};

/** Compact pill copy for the Initial Cut header (matches Stage 1/2/3 language). */
export const APPROVAL_STAGE_PILL_LABELS: Record<PackageApprovalStage, string> = {
  DRAFT: "DRAFT",
  ASSOCIATE_REVIEW: "STAGE 1",
  ADVISER_REVIEW: "STAGE 2",
  EXECUTIVE_REVIEW: "STAGE 3",
  APPROVED: "FINAL CUT"
};

export function approvalStagePillLabel(stage: string | null | undefined): string | null {
  if (!stage || !(stage in APPROVAL_STAGE_PILL_LABELS)) {
    return null;
  }
  return APPROVAL_STAGE_PILL_LABELS[stage as PackageApprovalStage];
}

export const APPROVAL_STAGE_HANDOFF: Record<PackageApprovalStage, string> = {
  DRAFT: "Back with the group for revisions.",
  ASSOCIATE_REVIEW: "Stage 1 · assigned producer.",
  ADVISER_REVIEW: "Stage 2 · adviser review. Not your stage.",
  EXECUTIVE_REVIEW: "Stage 3 · executive sign-off. Not your stage.",
  APPROVED: "Approved for Final Cut."
};

export function approvalStageHandoff(stage: string | null | undefined): string | null {
  if (!stage || !(stage in APPROVAL_STAGE_HANDOFF)) {
    return null;
  }
  return APPROVAL_STAGE_HANDOFF[stage as PackageApprovalStage];
}

export const EXECUTIVE_SIGNOFFS_REQUIRED = 2;
export const CONTROVERSIAL_SIGNOFFS_REQUIRED = 3;

export type Signoff = {
  userId: string;
  stage: PackageApprovalStage;
  approved: boolean;
};

export type ApprovalState = {
  stage: PackageApprovalStage;
  controversial: boolean;
  signoffs: Signoff[];
};

export type Actor = {
  userId: string;
  role: PlatformRole | null;
  /** True when this actor is the group's assigned producer (or AP category fallback). */
  ownsCategory?: boolean;
  /** True when this actor is on the package roster as a member. */
  isPackageMember?: boolean;
};

function isExecutive(role: PlatformRole | null) {
  return role === "EXECUTIVE_PRODUCER" || role === "SUPER_ADMIN";
}

export function requiredExecutiveSignoffs(controversial: boolean) {
  return controversial ? CONTROVERSIAL_SIGNOFFS_REQUIRED : EXECUTIVE_SIGNOFFS_REQUIRED;
}

export function nextStage(stage: PackageApprovalStage): PackageApprovalStage {
  const index = APPROVAL_STAGE_ORDER.indexOf(stage);
  if (index < 0 || index >= APPROVAL_STAGE_ORDER.length - 1) {
    return stage;
  }

  return APPROVAL_STAGE_ORDER[index + 1];
}

/**
 * Who is allowed to act on the current stage. The adviser deliberately cannot
 * satisfy stage 3 even though they hold executive-level permissions elsewhere.
 */
export function canActOnStage(state: ApprovalState, actor: Actor) {
  if (actor.role === "ASSOCIATE_PRODUCER" && actor.isPackageMember) {
    return false;
  }

  switch (state.stage) {
    case "ASSOCIATE_REVIEW":
      // Assigned AP only — never an AP who is on the package roster.
      // Assigned EP / super-admin may stand in as that AP. Other executives
      // cannot skip this stage.
      if (actor.role === "ASSOCIATE_PRODUCER") {
        return actor.ownsCategory === true;
      }
      return isExecutive(actor.role) && actor.ownsCategory === true;
    case "ADVISER_REVIEW":
      return actor.role === "ADVISER";
    case "EXECUTIVE_REVIEW":
      return isExecutive(actor.role);
    default:
      return false;
  }
}

function executiveApprovals(state: ApprovalState) {
  const approvers = new Set(
    state.signoffs
      .filter((entry) => entry.stage === "EXECUTIVE_REVIEW" && entry.approved)
      .map((entry) => entry.userId)
  );

  return approvers.size;
}

export function remainingExecutiveSignoffs(state: ApprovalState) {
  return Math.max(0, requiredExecutiveSignoffs(state.controversial) - executiveApprovals(state));
}

export function remainingFromApproval(
  approval:
    | {
        controversial?: boolean | null;
        signoffs?: Array<{ userId: string; stage: string; approved: boolean }>;
      }
    | null
    | undefined
) {
  return remainingExecutiveSignoffs({
    stage: "EXECUTIVE_REVIEW",
    controversial: Boolean(approval?.controversial),
    signoffs: (approval?.signoffs ?? []).map((entry) => ({
      userId: entry.userId,
      stage: entry.stage as PackageApprovalStage,
      approved: entry.approved
    }))
  });
}

/** Sentence for titles and helper text. */
export function executiveWaitLabel(remaining: number): string | null {
  if (remaining <= 0) return null;
  return remaining === 1
    ? "Waiting for 1 more exec approval"
    : `Waiting for ${remaining} more exec approvals`;
}

/** Compact pill copy. */
export function executiveWaitPill(remaining: number): string | null {
  if (remaining <= 0) return null;
  return remaining === 1 ? "1 exec left" : `${remaining} execs left`;
}

export function approvalProgressLabel(
  stage?: string | null,
  remainingExecutiveSignoffs?: number | null
): string | null {
  if (!stage) return null;
  if (stage === "DRAFT") return "Waiting for the group to upload a new version";
  if (stage === "ASSOCIATE_REVIEW") return "Waiting for the assigned producer (Stage 1)";
  if (stage === "ADVISER_REVIEW") return "Waiting for the adviser (Stage 2)";
  if (stage === "EXECUTIVE_REVIEW") return executiveWaitLabel(remainingExecutiveSignoffs ?? 2);
  if (stage === "APPROVED") return "Approved for Final Cut";
  return null;
}

export type ApprovalDecision =
  | { type: "ADVANCE"; stage: PackageApprovalStage }
  | { type: "HOLD_FOR_REVISION"; stage: PackageApprovalStage }
  | { type: "AWAIT_SIGNOFFS"; stage: PackageApprovalStage; remaining: number }
  | { type: "SEND_BACK"; stage: PackageApprovalStage }
  | { type: "FORBIDDEN" };

export type DecisionContext = {
  latestInitialCutVersion?: number;
  awaitingRevisedInitialCut?: boolean;
};

/**
 * Apply an approve/deny decision and report where the package lands.
 *
 * A denial always returns the package to DRAFT: the student revises and
 * resubmits from the top of the chain, which is what "you cannot skip a stage"
 * requires. Any executive producer can deny at stage 3 and send it back.
 * Stage 1 on v1 only holds for a revised cut instead of advancing to the adviser.
 */
export function applyDecision(
  state: ApprovalState,
  actor: Actor,
  approved: boolean,
  context: DecisionContext = {}
): ApprovalDecision {
  if (!canActOnStage(state, actor)) {
    return { type: "FORBIDDEN" };
  }

  if (!approved) {
    return { type: "SEND_BACK", stage: "DRAFT" };
  }

  if (state.stage === "ASSOCIATE_REVIEW") {
    if (context.awaitingRevisedInitialCut) {
      return { type: "FORBIDDEN" };
    }
    if ((context.latestInitialCutVersion ?? 1) < 2) {
      return { type: "HOLD_FOR_REVISION", stage: "ASSOCIATE_REVIEW" };
    }
    return { type: "ADVANCE", stage: "ADVISER_REVIEW" };
  }

  if (state.stage !== "EXECUTIVE_REVIEW") {
    return { type: "ADVANCE", stage: nextStage(state.stage) };
  }

  const withThisSignoff: ApprovalState = {
    ...state,
    signoffs: [
      ...state.signoffs,
      { userId: actor.userId, stage: "EXECUTIVE_REVIEW", approved: true }
    ]
  };

  const remaining = remainingExecutiveSignoffs(withThisSignoff);
  if (remaining > 0) {
    return { type: "AWAIT_SIGNOFFS", stage: "EXECUTIVE_REVIEW", remaining };
  }

  return { type: "ADVANCE", stage: "APPROVED" };
}

/**
 * Approve anyway: the Stage 1 owner may send a package held for a revised
 * upload on to Stage 2 with the latest cut instead of waiting for Version 2.
 */
export const APPROVE_ANYWAY_CONFIRM =
  "Send this package to Stage 2 without a revised upload? The adviser will review the latest version.";

export function canApproveAnyway(state: ApprovalState, actor: Actor, awaitingRevisedInitialCut: boolean) {
  return state.stage === "ASSOCIATE_REVIEW" && awaitingRevisedInitialCut && canActOnStage(state, actor);
}

export function isApprovedForFinalCut(state: ApprovalState) {
  return state.stage === "APPROVED";
}

/** Airing is Send to queue only. Approval only unlocks Final Cut. */
export function canPublish(state: ApprovalState) {
  void state;
  return false;
}

/**
 * Social media bypasses the package chain but still needs the Head of Creative
 * & Content, which we model as any executive producer.
 */
export function canApproveSocialMedia(actor: Actor) {
  return isExecutive(actor.role);
}

/**
 * Associates review the Initial Cut only through Stage 1. From Stage 2 on they
 * cannot comment on it, send it back, or withdraw their Stage 1 approval.
 */
export function associateReviewClosed(role: PlatformRole | null, stage: string | null | undefined) {
  if (role !== "ASSOCIATE_PRODUCER" || !stage) return false;
  return (
    APPROVAL_STAGE_ORDER.indexOf(stage as PackageApprovalStage) >
    APPROVAL_STAGE_ORDER.indexOf("ASSOCIATE_REVIEW")
  );
}

/** Reviewers may withdraw their own sign-off while they still hold that stage's role. */
export function unapproveStage(state: ApprovalState, actor: Actor): PackageApprovalStage | null {
  if (state.stage === "DRAFT") return null;
  if (associateReviewClosed(actor.role, state.stage)) return null;
  for (const stage of [...APPROVAL_STAGE_ORDER].reverse()) {
    if (APPROVAL_STAGE_ORDER.indexOf(stage) > APPROVAL_STAGE_ORDER.indexOf(state.stage)) continue;
    if (!canActOnStage({ ...state, stage }, actor)) continue;
    if (state.signoffs.some((entry) => entry.stage === stage && entry.userId === actor.userId && entry.approved)) {
      return stage;
    }
  }
  return null;
}
