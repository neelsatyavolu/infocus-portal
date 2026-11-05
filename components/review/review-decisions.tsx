"use client";

import type { ReactNode } from "react";
import { Check, ChevronDown, Flag, Radio } from "lucide-react";
import { ActionMenu } from "@/components/kit/menu";
import { Spinner } from "@/components/kit/spinner";
import { toneTextClass } from "@/components/kit/tone";
import { approvalPathSteps, type ApprovalStep } from "@/components/package-stages/stage-status";
import { Button } from "@/components/ui/button";
import { approvalStatusWord, type ReviewVersion } from "@/components/review/comment-utils";
import type { ApprovalStatusValue, MediaReviewDto } from "@/src/lib/types";
import { cn } from "@/src/lib/utils";

export type PackageReview = NonNullable<MediaReviewDto["packageReview"]>;

export function hasPackageDecision(review: PackageReview | null | undefined) {
  return Boolean(review && (review.canSubmitReview || review.canApprove || review.canUnapprove || review.canApproveAnyway));
}

/**
 * The instruction under the title on a package review, only when the viewer has one to follow.
 * Whose stage it is and how far along it is are already said by the approval strip and the
 * status tag, so they aren't repeated here.
 */
export function packageHelperText(review: PackageReview) {
  if (review.awaitingRevisedInitialCut || !review.canApprove) {
    return null;
  }
  return "Leave comments, then submit review to request revisions, or approve this stage.";
}

export function packageApprovalSteps(review: PackageReview, latestVersion: ReviewVersion | undefined): ApprovalStep[] {
  return approvalPathSteps({
    approvalStage: review.stage,
    hasMedia: true,
    needsRevisions: latestVersion?.approvalStatus === "NEEDS_CHANGES",
    awaitingRevisedInitialCut: Boolean(review.awaitingRevisedInitialCut),
    remainingExecutiveSignoffs: review.remainingExecutiveSignoffs ?? null
  });
}

const RULE: Record<ApprovalStep["state"], string> = {
  done: "border-[var(--brand-fill)]",
  current: "border-[var(--brand-green)] bg-[rgb(43_179_110/0.08)]",
  upcoming: "border-[var(--ink-4)]"
};

/** The step's own words, unless the status tag beside the title already says them. */
function stepNote(step: ApprovalStep, statusLabel: string | undefined, you: boolean) {
  const repeated = Boolean(
    step.state === "current" && step.stateLabel && statusLabel?.toLowerCase().includes(step.stateLabel.toLowerCase())
  );
  return [repeated ? null : step.stateLabel, you ? "You" : null].filter(Boolean).join(" · ");
}

/**
 * The approval path, one cell per stage (Stage 1 producer → Stage 2 adviser → Stage 3
 * executives), with the same steps and words as the Groups stage pages. "You" marks the stage the
 * viewer can decide on. Three cells side by side from sm; below that, one full-width line per
 * stage so nothing truncates.
 */
export function ApprovalStrip({
  steps,
  youCanDecide,
  statusLabel,
  className
}: {
  steps: ApprovalStep[];
  youCanDecide: boolean;
  /** The header's status tag, so the current step doesn't say the same thing again. */
  statusLabel?: string;
  className?: string;
}) {
  return (
    <ol aria-label="Approval path" className={cn("grid min-w-0 grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-2", className)}>
      {steps.map((step) => {
        const you = youCanDecide && step.state === "current";
        const note = stepNote(step, statusLabel, you);
        return (
          <li
            key={step.key}
            aria-current={step.state === "current" ? "step" : undefined}
            className={cn(
              "flex min-h-8 min-w-0 items-center gap-2 border-l-[3px] px-2 py-1.5 sm:border-l-0 sm:border-t-[3px]",
              RULE[step.state]
            )}
          >
            <span className="font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">{step.number}</span>
            <span
              className={cn(
                "min-w-0 truncate text-[13px] leading-tight",
                step.state === "current" ? "font-semibold text-foreground" : step.state === "done" ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
            {note ? (
              <span
                title={note}
                className={cn(
                  "ml-auto min-w-0 shrink-0 truncate text-[11px] font-medium uppercase leading-tight tracking-[0.11em] sm:shrink",
                  toneTextClass(step.tone)
                )}
              >
                {note}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export type DecisionHandlers = {
  isLatest: boolean;
  submittingReview: boolean;
  statusUpdating: boolean;
  onSubmitReview: () => void;
  onUnapprove: () => void;
  onApprove: () => void;
  onApproveAnyway: () => void;
  onChangeStatus: (status: ApprovalStatusValue) => void;
  onMarkAired: () => void;
};

/**
 * The viewer's decisions, as matched buttons with at most one primary (last):
 * - Package (Initial Cut): Submit review (needs revisions) · Unapprove · Approve anyway (to
 *   Stage 2) · Approve (or "Approve anyway" when this version needs changes). Same order and
 *   variants as the Groups stage page.
 * - Other media, for editors: a Status menu (In review / Needs changes / Approve vN / Aired…)
 *   and the next step as the primary (Approve vN, then Mark aired…).
 * Returns null when the viewer has nothing to decide.
 */
export function reviewDecisionButtons({
  packageReview,
  canUpdateApprovalStatus,
  version,
  handlers
}: {
  packageReview: PackageReview | null | undefined;
  canUpdateApprovalStatus: boolean;
  version: ReviewVersion | undefined;
  handlers: DecisionHandlers;
}): ReactNode[] | null {
  const { isLatest, submittingReview, statusUpdating } = handlers;
  const busy = submittingReview || statusUpdating;

  if (packageReview) {
    if (!hasPackageDecision(packageReview)) {
      return null;
    }
    const buttons: ReactNode[] = [];
    if (packageReview.canSubmitReview) {
      buttons.push(
        <Button key="submit" type="button" variant="outline" disabled={busy || !isLatest} onClick={handlers.onSubmitReview}>
          {submittingReview ? <Spinner /> : null}
          Submit review (needs revisions)
        </Button>
      );
    }
    if (packageReview.canUnapprove) {
      buttons.push(
        <Button key="unapprove" type="button" variant="outline" disabled={busy} onClick={handlers.onUnapprove}>
          Unapprove
        </Button>
      );
    }
    if (packageReview.canApproveAnyway) {
      buttons.push(
        <Button
          key="approve-anyway"
          type="button"
          variant={packageReview.canApprove ? "outline" : "default"}
          disabled={busy}
          onClick={handlers.onApproveAnyway}
        >
          Approve anyway
        </Button>
      );
    }
    if (packageReview.canApprove) {
      buttons.push(
        <Button key="approve" type="button" disabled={busy || !isLatest} onClick={handlers.onApprove}>
          {statusUpdating ? <Spinner /> : null}
          {version?.approvalStatus === "NEEDS_CHANGES" ? "Approve anyway" : "Approve"}
        </Button>
      );
    }
    return buttons;
  }

  if (!canUpdateApprovalStatus || !version) {
    return null;
  }

  const status = version.approvalStatus;
  const canMarkAired = status === "APPROVED" || status === "AIRED";
  const buttons: ReactNode[] = [
    <ActionMenu
      key="status"
      label="Set status"
      align="end"
      disabled={statusUpdating}
      trigger={
        <Button type="button" variant="outline" disabled={statusUpdating}>
          {statusUpdating ? <Spinner /> : <Flag aria-hidden />}
          Status
          <ChevronDown aria-hidden className="opacity-60" />
        </Button>
      }
      items={[
        { key: "IN_REVIEW", label: approvalStatusWord("IN_REVIEW"), checked: status === "IN_REVIEW", onSelect: () => handlers.onChangeStatus("IN_REVIEW") },
        {
          key: "NEEDS_CHANGES",
          label: approvalStatusWord("NEEDS_CHANGES"),
          checked: status === "NEEDS_CHANGES",
          onSelect: () => handlers.onChangeStatus("NEEDS_CHANGES")
        },
        {
          key: "APPROVED",
          label: `Approve v${version.versionNumber}`,
          checked: status === "APPROVED",
          onSelect: () => handlers.onChangeStatus("APPROVED")
        },
        {
          key: "AIRED",
          label: "Aired…",
          checked: status === "AIRED",
          disabled: !canMarkAired,
          hint: canMarkAired ? undefined : "Approve this version before marking aired",
          onSelect: handlers.onMarkAired
        }
      ]}
    />
  ];
  if (status === "IN_REVIEW" || status === "NEEDS_CHANGES") {
    buttons.push(
      <Button key="next" type="button" disabled={statusUpdating} onClick={() => handlers.onChangeStatus("APPROVED")}>
        <Check aria-hidden />
        Approve v{version.versionNumber}
      </Button>
    );
  } else if (status === "APPROVED") {
    buttons.push(
      <Button key="next" type="button" disabled={statusUpdating} onClick={handlers.onMarkAired}>
        <Radio aria-hidden />
        Mark as aired…
      </Button>
    );
  }
  return buttons;
}
