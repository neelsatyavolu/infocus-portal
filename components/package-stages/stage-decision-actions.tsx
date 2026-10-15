"use client";

import { useState, type ReactNode } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/kit/spinner";
import { ApproveFeedbackDialog } from "@/components/package-cycle/approve-feedback-dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { StageView } from "@/components/package-stages/types";
import { approvalStageToReviewStage } from "@/src/lib/group-tile-status";
import { APPROVE_ANYWAY_CONFIRM } from "@/src/lib/package-approval";
import type { CycleStageSlug } from "@/src/lib/package-cycle-gates";

async function postJson(url: string, body: unknown, method = "POST") {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

const SUBMIT_REVIEW_LABEL = "Submit review (needs revisions)";

/** One control in the decision bar. `dock`: pinned above the phone tab bar (the main decisions only). */
export type DecisionAction = { key: string; node: ReactNode; dock?: boolean };

/**
 * A producer's decisions on one stage, as matched h-9 buttons (one primary at most) plus the
 * dialogs they open. Unapprove and Remove from queue are reversible state changes, so they stay
 * outline buttons (as on the Review page), never destructive. Open review lives beside the
 * newest cut in the media panel, not here.
 * - A-roll/B-roll: Approve A-roll/B-roll → "Any feedback to add?".
 * - Initial Cut: Submit review (needs revisions) · Approve (or Approve anyway), Unapprove, and
 *   Approve anyway → "Send to Stage 2" confirm (never shown together with the Approve decision).
 *   Shown only on the tab for the package's current review stage.
 * - Final Cut: Send to queue / Remove from queue once a Final Cut exists.
 * On phones only the main decision pair docks (Submit review + Approve, or the one approve).
 */
export function useStageDecisions({
  slug,
  view,
  reviewStage,
  enabled,
  queuePrimary,
  reload
}: {
  slug: CycleStageSlug;
  view: StageView | null;
  reviewStage?: 1 | 2 | 3;
  /** Producer view only (Groups). */
  enabled: boolean;
  /** Final Cut: Send to queue is the view's one primary. */
  queuePrimary: boolean;
  reload: () => Promise<void>;
}) {
  const [approveKind, setApproveKind] = useState<"aroll" | "cut" | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveAnywayOpen, setApproveAnywayOpen] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const row = view?.row;

  async function approveAroll(feedback: string) {
    if (!row) return;
    setApproving(true);
    try {
      const response = await postJson(
        "/api/package-cycle/stage",
        { kind: "approve-aroll", rowId: row.id, approved: true, feedback },
        "PATCH"
      );
      if (!response.ok) {
        toast.error("Could not update A-roll/B-roll.");
        return;
      }
      setApproveKind(null);
      toast.success("A-roll/B-roll approved.");
      await reload();
    } finally {
      setApproving(false);
    }
  }

  async function approveCut(approved: boolean, feedback?: string, unapprove = false) {
    if (!row) return;
    setApproving(true);
    try {
      const response = await postJson(`/api/package-progress/${row.id}/approval`, {
        action: unapprove ? "UNAPPROVE" : approved ? "DECIDE" : "SUBMIT_REVIEW",
        approved,
        note: approved ? feedback : undefined
      });
      if (!response.ok) {
        toast.error("Could not update the review.");
        return;
      }
      setApproveKind(null);
      toast.success(
        unapprove ? "Approval withdrawn." : approved ? "Approval recorded." : "Review submitted — needs revisions."
      );
      await reload();
    } finally {
      setApproving(false);
    }
  }

  async function approveCutAnyway() {
    if (!row) return;
    setApproving(true);
    try {
      const response = await postJson(`/api/package-progress/${row.id}/approval`, { action: "APPROVE_ANYWAY" });
      if (!response.ok) {
        toast.error("Could not send the package to Stage 2.");
        return;
      }
      toast.success("Sent to Stage 2.");
      await reload();
    } finally {
      setApproving(false);
    }
  }

  async function queue(queued: boolean) {
    if (!row) return;
    setQueueing(true);
    try {
      const response = await postJson("/api/package-cycle/queue", { rowId: row.id, queued });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        toast.error(payload.error?.message ?? "Could not update the publishing queue.");
        return;
      }
      toast.success(queued ? "Sent to publishing queue." : "Removed from queue.");
      // Quiet reload keeps any scores an executive producer has typed but not saved.
      await reload();
    } finally {
      setQueueing(false);
    }
  }

  const actions: DecisionAction[] = [];
  const media = view?.media ?? [];

  if (enabled && row && slug === "a-roll" && view?.canApproveAroll) {
    actions.push({
      key: "approve-aroll",
      dock: true,
      node: (
        <Button type="button" disabled={approving} onClick={() => setApproveKind("aroll")}>
          Approve A-roll/B-roll
        </Button>
      )
    });
  }

  if (enabled && row && slug === "initial-cut") {
    const approval = view?.cutApproval;
    const onCurrentTab = !reviewStage || reviewStage === approvalStageToReviewStage(approval?.stage);
    const canDecide = Boolean(approval?.canAct && onCurrentTab);
    if (canDecide) {
      actions.push({
        key: "submit-review",
        dock: true,
        node: (
          // Below lg it sits in the phone dock beside Approve, so it shows the short words there
          // (one row); the full label stays the accessible name and the desktop text.
          <Button
            type="button"
            variant="outline"
            disabled={approving}
            onClick={() => void approveCut(false)}
            aria-label={SUBMIT_REVIEW_LABEL}
            title={SUBMIT_REVIEW_LABEL}
            className="max-lg:px-3"
          >
            <span aria-hidden className="lg:hidden">
              Needs revisions
            </span>
            <span aria-hidden className="max-lg:hidden">
              {SUBMIT_REVIEW_LABEL}
            </span>
          </Button>
        )
      });
    }
    if (approval?.canUnapprove) {
      actions.push({
        key: "unapprove",
        node: (
          <Button
            type="button"
            variant="outline"
            disabled={approving}
            onClick={() => void approveCut(false, undefined, true)}
          >
            Unapprove
          </Button>
        )
      });
    }
    if (approval?.canApproveAnyway) {
      actions.push({
        key: "approve-anyway-stage-2",
        dock: !canDecide,
        node: (
          <Button
            type="button"
            variant={canDecide ? "outline" : "default"}
            disabled={approving}
            onClick={() => setApproveAnywayOpen(true)}
          >
            Approve anyway
          </Button>
        )
      });
    }
    if (canDecide) {
      actions.push({
        key: "approve",
        dock: true,
        node: (
          <Button type="button" disabled={approving} onClick={() => setApproveKind("cut")} className="max-lg:px-3">
            {row.initialCutNeedsRevisions ? "Approve anyway" : "Approve"}
          </Button>
        )
      });
    }
  }

  if (enabled && row && slug === "final-cut" && media.length > 0) {
    const queued = Boolean(row.queuedForAirAt);
    actions.push({
      key: "queue",
      node: (
        <Button
          type="button"
          variant={!queued && queuePrimary ? "default" : "outline"}
          disabled={queueing}
          onClick={() => void queue(!queued)}
        >
          {queueing ? <Spinner /> : queued ? null : <Send aria-hidden />}
          {queued ? "Remove from queue" : "Send to queue"}
        </Button>
      )
    });
  }

  const dialogs = (
    <>
      <ApproveFeedbackDialog
        open={Boolean(approveKind)}
        saving={approving}
        onOpenChange={(open) => {
          if (!open) setApproveKind(null);
        }}
        onConfirm={(feedback) => {
          if (approveKind === "aroll") {
            void approveAroll(feedback);
            return;
          }
          if (approveKind === "cut") {
            void approveCut(true, feedback);
          }
        }}
      />
      <ConfirmDialog
        open={approveAnywayOpen}
        onOpenChange={setApproveAnywayOpen}
        title="Approve anyway?"
        description={APPROVE_ANYWAY_CONFIRM}
        confirmLabel="Send to Stage 2"
        cancelLabel="Not yet"
        tone="default"
        onConfirm={() => approveCutAnyway()}
      />
    </>
  );

  return { actions, dialogs };
}
