"use client";

import { ApproveFeedbackDialog } from "@/components/package-cycle/approve-feedback-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AiredDateDialog } from "@/components/review/aired-date-dialog";
import type { ReviewDecisionsState } from "@/components/review/use-review-decisions";
import { APPROVE_ANYWAY_CONFIRM } from "@/src/lib/package-approval";

export type DeleteRequest = { id: string; replyCount: number };

/**
 * The review page's confirmations: Approve anyway (send to Stage 2), Delete comment, Approve with
 * feedback, and Mark as aired.
 */
export function ReviewDialogs({
  decisions,
  deleteRequest,
  deleteOpen,
  onDeleteOpenChange,
  onConfirmDelete
}: {
  decisions: ReviewDecisionsState;
  deleteRequest: DeleteRequest | null;
  deleteOpen: boolean;
  onDeleteOpenChange: (open: boolean) => void;
  onConfirmDelete: () => Promise<void> | void;
}) {
  return (
    <>
      <ConfirmDialog
        open={decisions.approveAnywayOpen}
        onOpenChange={decisions.setApproveAnywayOpen}
        title="Approve anyway?"
        description={APPROVE_ANYWAY_CONFIRM}
        confirmLabel="Send to Stage 2"
        cancelLabel="Cancel"
        tone="default"
        onConfirm={decisions.approveAnyway}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={onDeleteOpenChange}
        title="Delete comment?"
        description={
          deleteRequest && deleteRequest.replyCount > 0
            ? `This also deletes ${deleteRequest.replyCount} ${deleteRequest.replyCount === 1 ? "reply" : "replies"}.`
            : "This can't be undone."
        }
        confirmLabel="Delete"
        onConfirm={onConfirmDelete}
      />
      <ApproveFeedbackDialog
        open={decisions.approveFeedbackOpen}
        saving={decisions.statusUpdating}
        onOpenChange={decisions.setApproveFeedbackOpen}
        onConfirm={(feedback) => void decisions.approve(feedback)}
      />
      <AiredDateDialog
        open={decisions.airedDialogOpen}
        onOpenChange={decisions.setAiredDialogOpen}
        value={decisions.airedDateInput}
        onValueChange={decisions.setAiredDateInput}
        saving={decisions.statusUpdating}
        onConfirm={() => void decisions.confirmAired()}
      />
    </>
  );
}
