"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Panel } from "@/components/kit/panel";
import { Spinner } from "@/components/kit/spinner";
import { ApproveFeedbackDialog } from "@/components/package-cycle/approve-feedback-dialog";
import { StageComments } from "@/components/package-cycle/stage-comments";
import { DecisionBar } from "@/components/package-stages/stage-header";
import { Button } from "@/components/ui/button";
import {
  brainstormMaterialsReady,
  PROOF_OF_CONTACT_REQUIRED,
  type BrainstormProofView
} from "@/src/lib/package-brainstorm";
import { requestNavStatusRefresh } from "@/src/lib/sidebar-nav";
import { BrainstormReview } from "./brainstorm-review";
import { CycleStatusTag } from "./cycle-status-tag";
import { useStageFlag } from "./group-stage-state";
import { contactStatus, formatStageDay, pitchStatus } from "./stage-bar-model";

/** PATCH approve / unapprove, with the optional feedback dialog on approve and none on undo. */
function useApprovalToggle({
  endpoint,
  kind,
  rowId,
  canEdit,
  setDone,
  messages
}: {
  endpoint: string;
  kind: string;
  rowId: string;
  canEdit: boolean;
  setDone: (next: boolean) => void;
  messages: { approved: string; unapproved: string; failed: string };
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  async function toggle(next: boolean, feedback?: string) {
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, rowId, approved: next, feedback: next ? feedback : undefined })
      });
      if (!response.ok) {
        throw new Error(messages.failed);
      }
      setDone(next);
      setFeedbackOpen(false);
      toast.success(next ? messages.approved : messages.unapproved);
      router.refresh();
      // The sidebar's Groups count (Needs you) counts these approvals; don't wait out its freshness window.
      requestNavStatusRefresh(["groups"]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : messages.failed);
    } finally {
      setSaving(false);
    }
  }

  return { saving, feedbackOpen, setFeedbackOpen, toggle };
}

function busy(saving: boolean) {
  return saving ? <Spinner /> : null;
}

/** The stage body's two columns, as on A/B-roll, Initial and Final: the work, then feedback (24rem from xl). */
const BODY_GRID = "grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]";

/**
 * Decisions are 40px on phones, where they dock above the tab bar (the dock's row holds children
 * to h-9; a child's own max-sm height wins), matching the feedback composer's Post button.
 */
const TOUCH = "max-sm:h-10";

/**
 * The stage column. Below lg the decision bar docks its decisions above the tab bar, and the
 * dock's in-flow spacer (the only aria-hidden child) follows the bar in the DOM; `order-last`
 * moves it to the end of the stage, where it keeps the page's end clear of the dock instead of
 * opening a gap under the bar.
 */
const STAGE_COLUMN = "flex min-w-0 flex-col gap-5 [&>[aria-hidden]]:order-last";

/**
 * Pitch: the same decision bar as the later stages (status, one line, the decision; docked above
 * the tab bar on phones), then the pitch feedback thread on the page at reading width.
 */
export function PitchingPanel({
  rowId,
  approved,
  canEdit
}: {
  rowId: string;
  approved: boolean;
  canEdit: boolean;
}) {
  const [done, setDone] = useStageFlag("pitching", approved);
  const { saving, feedbackOpen, setFeedbackOpen, toggle } = useApprovalToggle({
    endpoint: "/api/package-cycle/stage",
    kind: "approve-pitching",
    rowId,
    canEdit,
    setDone,
    messages: { approved: "Pitch marked complete.", unapproved: "Pitch unmarked.", failed: "Could not update pitching." }
  });

  const action = !canEdit ? null : done ? (
    <Button type="button" variant="outline" disabled={saving} onClick={() => void toggle(false)} className={TOUCH}>
      {busy(saving)}
      Unmark pitch
    </Button>
  ) : (
    <Button type="button" disabled={saving} onClick={() => setFeedbackOpen(true)} className={TOUCH}>
      {busy(saving)}
      Mark pitch complete
    </Button>
  );

  return (
    <div className={STAGE_COLUMN}>
      <DecisionBar
        heading="Pitch"
        status={<CycleStatusTag status={pitchStatus(done)} />}
        progress={
          done ? "This group’s pitch check-in is complete." : "Mark the pitch check-in once this group has presented."
        }
        actions={action}
        phoneDock={Boolean(action)}
      />
      {/* The thread is the whole body: held to a reading width on this wide route. */}
      <StageComments variant="panel" rowId={rowId} stage="pitching" canWrite={canEdit} className="max-w-3xl" />
      <ApproveFeedbackDialog
        open={feedbackOpen}
        saving={saving}
        onOpenChange={setFeedbackOpen}
        onConfirm={(feedback) => void toggle(true, feedback)}
      />
    </div>
  );
}

/** "2/3 proofs · Doc linked · Proofs updated Oct 8": the readiness tally behind Approve / Approve anyway. */
function contactFacts({
  proofCount,
  docUrl,
  revisions,
  approved,
  proofsUpdatedAt,
  feedbackAt
}: {
  proofCount: number;
  docUrl: string;
  revisions: boolean;
  approved: boolean;
  proofsUpdatedAt: string | null;
  feedbackAt: string | null;
}) {
  const day = approved ? null : formatStageDay(revisions ? feedbackAt : proofsUpdatedAt);
  const when = day ? `${revisions ? "Feedback sent" : "Proofs updated"} ${day}` : null;
  return [
    `${proofCount}/${PROOF_OF_CONTACT_REQUIRED} proofs`,
    docUrl ? "Doc linked" : "No Google Doc yet",
    when
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Contact: the decision bar, then the proofs and doc beside the feedback thread (the same two
 * columns as the later stages).
 */
export function BrainstormingPanel({
  rowId,
  proofs,
  docUrl,
  approved,
  needsChanges,
  canEdit,
  proofsUpdatedAt = null,
  feedbackAt = null
}: {
  rowId: string;
  proofs: BrainstormProofView[];
  docUrl: string;
  approved: boolean;
  needsChanges: boolean;
  canEdit: boolean;
  proofsUpdatedAt?: string | null;
  feedbackAt?: string | null;
}) {
  const router = useRouter();
  const [done, setDone] = useStageFlag("proofOfContact", approved);
  const { saving, feedbackOpen, setFeedbackOpen, toggle } = useApprovalToggle({
    endpoint: "/api/brainstorming",
    kind: "approve",
    rowId,
    canEdit,
    setDone,
    messages: {
      approved: "Proof of contact approved.",
      unapproved: "Proof of contact unmarked.",
      failed: "Could not update brainstorming."
    }
  });

  const status = contactStatus({
    proofOfContact: done,
    proofCount: proofs.length,
    brainstormDocUrl: docUrl,
    brainstormNeedsChanges: needsChanges
  });
  const ready = brainstormMaterialsReady(proofs.length, docUrl);

  const action = !canEdit ? null : done ? (
    <Button type="button" variant="outline" disabled={saving} onClick={() => void toggle(false)} className={TOUCH}>
      {busy(saving)}
      Unapprove
    </Button>
  ) : (
    // Approving incomplete work is allowed, but it isn't the suggested next step.
    <Button
      type="button"
      variant={ready ? "default" : "outline"}
      disabled={saving}
      onClick={() => setFeedbackOpen(true)}
      className={TOUCH}
    >
      {busy(saving)}
      {ready ? "Approve" : "Approve anyway"}
    </Button>
  );

  return (
    <div className={STAGE_COLUMN}>
      <DecisionBar
        heading="Contact"
        status={<CycleStatusTag status={status} />}
        progress={
          <>
            Review the three proofs and the group Google Doc, then approve the check-in.{" "}
            <span className="font-mono-broadcast text-xs tabular-nums">
              {contactFacts({
                proofCount: proofs.length,
                docUrl,
                revisions: status === "needs-revisions",
                approved: done,
                proofsUpdatedAt,
                feedbackAt
              })}
            </span>
          </>
        }
        actions={action}
        phoneDock={Boolean(action)}
      />
      <div className={BODY_GRID}>
        <div className="min-w-0">
          <Panel title="Materials" padding="md">
            <BrainstormReview proofs={proofs} docUrl={docUrl} />
          </Panel>
        </div>
        <div className="min-w-0">
          <StageComments
            variant="panel"
            rowId={rowId}
            stage="brainstorming"
            canWrite={canEdit}
            onPosted={() => {
              // Feedback without approving is a revision request: the status and the sidebar count move.
              router.refresh();
              requestNavStatusRefresh(["groups"]);
            }}
          />
        </div>
      </div>
      <ApproveFeedbackDialog
        open={feedbackOpen}
        saving={saving}
        onOpenChange={setFeedbackOpen}
        onConfirm={(feedback) => void toggle(true, feedback)}
      />
    </div>
  );
}
