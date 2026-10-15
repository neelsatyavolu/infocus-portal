"use client";

import { useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toAiredDateInput, type ReviewVersion } from "@/components/review/comment-utils";
import type { PackageReview } from "@/components/review/review-decisions";
import { requestNavStatusRefresh } from "@/src/lib/sidebar-nav";
import type { ApprovalStatusValue } from "@/src/lib/types";

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

export type ReviewDecisionsState = ReturnType<typeof useReviewDecisions>;

/**
 * Review decisions and their dialogs. Package (Initial Cut) decisions re-render the page's server
 * data when they succeed (router.refresh(), no full reload; the shell keeps the selected version),
 * since the approval strip, version statuses and comment lock all come from it, and stay busy until
 * that data arrives. Other media set a version's status in place.
 */
export function useReviewDecisions({
  mediaId,
  packageReview,
  currentVersion,
  isGuest,
  setVersions
}: {
  mediaId: string;
  packageReview: PackageReview | null | undefined;
  currentVersion: ReviewVersion | undefined;
  isGuest: boolean;
  setVersions: Dispatch<SetStateAction<ReviewVersion[]>>;
}) {
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [approveFeedbackOpen, setApproveFeedbackOpen] = useState(false);
  const [approveAnywayOpen, setApproveAnywayOpen] = useState(false);
  const [airedDialogOpen, setAiredDialogOpen] = useState(false);
  const [airedDateInput, setAiredDateInput] = useState("");
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [refreshingReview, setRefreshingReview] = useState(false);

  /** After a package decision: the page's server data and the sidebar's Groups and package counts. */
  function refreshAfterDecision(review = false) {
    setRefreshingReview(review);
    startRefresh(() => router.refresh());
    requestNavStatusRefresh(["groups", "package"]);
  }

  async function postPackageApproval(body: Record<string, unknown>) {
    return fetch(`/api/media/${mediaId}/package-approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  async function submitReview() {
    if (!packageReview?.canSubmitReview || !currentVersion) {
      return;
    }
    setSubmittingReview(true);
    try {
      const response = await postPackageApproval({ action: "SUBMIT_REVIEW", mediaVersionId: currentVersion.id });
      if (!response.ok) {
        throw new Error(await errorMessage(response, "Could not submit review."));
      }
      setVersions((current) =>
        current.map((version) => (version.id === currentVersion.id ? { ...version, approvalStatus: "NEEDS_CHANGES" } : version))
      );
      refreshAfterDecision(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit review.");
    } finally {
      setSubmittingReview(false);
    }
  }

  async function approve(feedback?: string, unapprove = false) {
    if (!(unapprove ? packageReview?.canUnapprove : packageReview?.canApprove)) {
      return;
    }
    setStatusUpdating(true);
    try {
      const response = await postPackageApproval({
        action: unapprove ? "UNAPPROVE" : "DECIDE",
        approved: true,
        note: feedback,
        mediaVersionId: currentVersion?.id
      });
      if (!response.ok) {
        throw new Error(await errorMessage(response, "Could not approve this cut."));
      }
      setApproveFeedbackOpen(false);
      refreshAfterDecision();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve this cut.");
    } finally {
      setStatusUpdating(false);
    }
  }

  /** Runs from the confirm dialog; rethrows so the dialog stays open when the request fails. */
  async function approveAnyway() {
    if (!packageReview?.canApproveAnyway) {
      return;
    }
    setStatusUpdating(true);
    try {
      const response = await postPackageApproval({ action: "APPROVE_ANYWAY" });
      if (!response.ok) {
        throw new Error(await errorMessage(response, "Could not send the package to Stage 2."));
      }
      refreshAfterDecision();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the package to Stage 2.");
      throw error;
    } finally {
      setStatusUpdating(false);
    }
  }

  async function changeStatus(nextStatus: ApprovalStatusValue, airedAtIso?: string) {
    if (!currentVersion || isGuest) {
      return;
    }
    setStatusUpdating(true);
    try {
      const response = await fetch(`/api/media/${mediaId}/approval-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaVersionId: currentVersion.id,
          status: nextStatus,
          ...(nextStatus === "AIRED" && airedAtIso ? { airedAt: airedAtIso } : {})
        })
      });
      if (!response.ok) {
        throw new Error("Failed");
      }
      const nextAiredAt = nextStatus === "AIRED" ? (airedAtIso ?? null) : null;
      setVersions((current) =>
        current.map((version) =>
          version.id === currentVersion.id ? { ...version, approvalStatus: nextStatus, airedAt: nextAiredAt } : version
        )
      );
    } catch {
      toast.error("Could not update approval state.");
    } finally {
      setStatusUpdating(false);
    }
  }

  function openAiredDialog() {
    setAiredDateInput(toAiredDateInput(currentVersion?.airedAt ?? null));
    setAiredDialogOpen(true);
  }

  async function confirmAired() {
    if (!airedDateInput) {
      return;
    }
    setAiredDialogOpen(false);
    await changeStatus("AIRED", `${airedDateInput}T00:00:00.000Z`);
  }

  return {
    statusUpdating: statusUpdating || (refreshing && !refreshingReview),
    submittingReview: submittingReview || (refreshing && refreshingReview),
    approveFeedbackOpen,
    setApproveFeedbackOpen,
    approveAnywayOpen,
    setApproveAnywayOpen,
    airedDialogOpen,
    setAiredDialogOpen,
    airedDateInput,
    setAiredDateInput,
    submitReview,
    approve,
    approveAnyway,
    changeStatus,
    openAiredDialog,
    confirmAired
  };
}
