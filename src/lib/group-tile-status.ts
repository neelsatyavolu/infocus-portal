import type { PlatformRole } from "@prisma/client";
import { brainstormMaterialsReady } from "@/src/lib/package-brainstorm";
import { approvalProgressLabel, executiveWaitPill } from "@/src/lib/package-approval";
import { initialCutVersionTitle } from "@/src/lib/package-cut-transitions";
import { isAssignedPackageProducer } from "@/src/lib/package-producer-assignment";

export type GroupTileStatusTone = "neutral" | "warn" | "review" | "danger" | "approved";

export type GroupTileStatus = {
  label: string;
  tone: GroupTileStatusTone;
};

export type GroupTileStatusInput = {
  reviewReadyAt?: Partial<Record<"brainstorming" | "a-roll" | "initial-cut", string | null>>;
  pitching: boolean;
  proofOfContact: boolean;
  proofCount: number;
  brainstormDocUrl: string;
  aRollBRoll: boolean;
  aRollHasMedia: boolean;
  aRollNeedsChanges?: boolean;
  initialCutHasMedia: boolean;
  initialCutVersionNumber: number | null;
  initialCutNeedsRevisions: boolean;
  awaitingRevisedInitialCut: boolean;
  approvalStage: string | null;
  remainingExecutiveSignoffs?: number | null;
  finalCutHasMedia: boolean;
  queuedForAir: boolean;
};

const TONE_CLASS: Record<GroupTileStatusTone, string> = {
  neutral: "status-neutral",
  warn: "status-warn",
  review: "status-review",
  danger: "status-danger",
  approved: "status-approved"
};

export function groupTileStatusClass(tone: GroupTileStatusTone) {
  return TONE_CLASS[tone];
}

function cutLabel(versionNumber: number | null) {
  return versionNumber && versionNumber > 0 ? initialCutVersionTitle(versionNumber) : "Initial Cut";
}

export function groupTileStatus(input: GroupTileStatusInput, now = Date.now()): GroupTileStatus {
  function pendingReview(stage: "brainstorming" | "a-roll" | "initial-cut", label: string): GroupTileStatus {
    const submittedAt = input.reviewReadyAt?.[stage];
    const timestamp = submittedAt ? Date.parse(submittedAt) : NaN;
    const suffix = Number.isFinite(timestamp)
      ? ` for ${Math.max(0, Math.floor((now - timestamp) / 3_600_000))}h`
      : "";
    return { label: `${label} Pending Review${suffix}`, tone: "warn" };
  }

  if (!input.pitching) {
    return { label: "Pitch Pending", tone: "neutral" };
  }

  if (!input.proofOfContact) {
    if (brainstormMaterialsReady(input.proofCount, input.brainstormDocUrl)) {
      return pendingReview("brainstorming", "Brainstorm");
    }
    return { label: "Brainstorming", tone: "neutral" };
  }

  if (!input.aRollBRoll) {
    if (input.aRollNeedsChanges && input.aRollHasMedia) {
      return { label: "A-roll/B-roll Needs Revisions", tone: "danger" };
    }
    if (input.aRollHasMedia) {
      return pendingReview("a-roll", "A-roll/B-roll");
    }
    return { label: "A-roll/B-roll Pending", tone: "neutral" };
  }

  if (input.approvalStage !== "APPROVED") {
    const version = cutLabel(input.initialCutVersionNumber);
    if (!input.initialCutHasMedia) {
      return { label: "Initial Cut Pending", tone: "neutral" };
    }
    if (input.initialCutNeedsRevisions || input.approvalStage === "DRAFT") {
      return { label: `${version} Needs Revisions`, tone: "danger" };
    }
    if (input.awaitingRevisedInitialCut && input.approvalStage === "ASSOCIATE_REVIEW") {
      return { label: "Approved in Stage 1 · Awaiting revised upload", tone: "approved" };
    }
    if (input.approvalStage === "ADVISER_REVIEW") {
      return { label: approvalProgressLabel("ADVISER_REVIEW") ?? "Waiting for the adviser (Stage 2)", tone: "review" };
    }
    if (input.approvalStage === "EXECUTIVE_REVIEW") {
      return {
        label:
          executiveWaitPill(input.remainingExecutiveSignoffs ?? 2) ??
          approvalProgressLabel("EXECUTIVE_REVIEW", input.remainingExecutiveSignoffs) ??
          "Waiting for exec approvals",
        tone: "review"
      };
    }
    return pendingReview("initial-cut", version);
  }

  if (input.queuedForAir) {
    return { label: "Final Cut Queued", tone: "approved" };
  }
  if (input.finalCutHasMedia) {
    return { label: "Final Cut Submitted", tone: "warn" };
  }
  return { label: "Final Cut Pending", tone: "neutral" };
}

export type GroupViewerAttentionInput = {
  finalCutHasMedia?: boolean;
  queuedForAir?: boolean;
  currentUserId?: string | null;
  scoredByUserIds?: string[] | null;
  assignedProducerUserId?: string | null;
  assignedExecutiveProducerUserId?: string | null;
  proofOfContact?: boolean;
  proofCount?: number;
  brainstormDocUrl?: string;
  aRollBRoll?: boolean;
  aRollHasMedia?: boolean;
};

export function approvalStageToReviewStage(stage?: string | null): 1 | 2 | 3 | null {
  if (stage === "ASSOCIATE_REVIEW") return 1;
  if (stage === "ADVISER_REVIEW") return 2;
  if (stage === "EXECUTIVE_REVIEW" || stage === "APPROVED") return 3;
  return null;
}

export function cutTileReviewStatus(input: {
  approvalStatus?: string | null;
  reviewStage?: 1 | 2 | 3 | null;
  approvedInStage?: 1 | 2 | 3 | null;
  remainingExecutiveSignoffs?: number | null;
}): GroupTileStatus {
  const { approvalStatus, reviewStage, approvedInStage, remainingExecutiveSignoffs } = input;
  if (approvalStatus === "NEEDS_CHANGES") {
    return { label: "Needs revisions", tone: "danger" };
  }
  const execWait =
    reviewStage === 3 && remainingExecutiveSignoffs != null && remainingExecutiveSignoffs > 0
      ? executiveWaitPill(remainingExecutiveSignoffs)
      : null;
  if (execWait && approvedInStage && approvedInStage < 3) {
    return { label: `${execWait} · Approved in Stage ${approvedInStage}`, tone: "review" };
  }
  if (execWait) {
    return { label: execWait, tone: "review" };
  }
  if (approvedInStage && reviewStage && approvedInStage < reviewStage) {
    return { label: `Pending review · Approved in Stage ${approvedInStage}`, tone: "review" };
  }
  if (approvedInStage && (!reviewStage || approvedInStage >= reviewStage)) {
    return { label: `Approved in Stage ${approvedInStage}`, tone: "approved" };
  }
  if (approvalStatus === "APPROVED") {
    return { label: "Approved", tone: "approved" };
  }
  return { label: "Pending review", tone: "review" };
}

/** Assigned producer at brainstorming / a-roll / Stage 1; adviser at Stage 2; execs at Stage 3 and unscored Final Cut. */
export function groupViewerAttention(
  role: PlatformRole | null,
  approvalStage: string | null | undefined,
  extra: GroupViewerAttentionInput = {}
): "needed" | "waiting" | null {
  if (role === "ADVISER") {
    return approvalStage === "ADVISER_REVIEW" ? "needed" : "waiting";
  }
  if (role === "EXECUTIVE_PRODUCER" || role === "SUPER_ADMIN") {
    const assignedToViewer = isAssignedPackageProducer(extra, extra.currentUserId);
    if (assignedToViewer && extra.proofOfContact === false) {
      return brainstormMaterialsReady(extra.proofCount ?? 0, extra.brainstormDocUrl ?? "")
        ? "needed"
        : null;
    }
    if (assignedToViewer && extra.aRollBRoll === false) {
      return extra.aRollHasMedia ? "needed" : null;
    }
    if (approvalStage === "ASSOCIATE_REVIEW" && assignedToViewer) return "needed";
    if (approvalStage === "EXECUTIVE_REVIEW") return "needed";
    if (approvalStage === "APPROVED" && extra.finalCutHasMedia && !extra.queuedForAir) {
      if (extra.currentUserId && extra.scoredByUserIds?.includes(extra.currentUserId)) {
        return "waiting";
      }
      return "needed";
    }
    return "waiting";
  }
  return null;
}
