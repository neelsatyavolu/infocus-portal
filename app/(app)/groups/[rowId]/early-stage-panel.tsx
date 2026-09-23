"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApproveFeedbackDialog } from "@/components/package-cycle/approve-feedback-dialog";
import { Button } from "@/components/ui/button";
import { StageComments } from "@/components/package-cycle/stage-comments";
import { StageStatusChip } from "@/components/package-cycle/stage-status-chip";
import { BrainstormMaterials } from "../brainstorm-materials";
import type { BrainstormProofView } from "@/src/lib/package-brainstorm";
import { cycleStageStatus, emptyCycleStageStatusInput } from "@/src/lib/package-stage-status";

export function PitchingPanel({
  rowId,
  approved,
  canEdit
}: {
  rowId: string;
  approved: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = useState(approved);
  const [saving, setSaving] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  async function toggle(next: boolean, feedback?: string) {
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/package-cycle/stage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "approve-pitching",
          rowId,
          approved: next,
          feedback: next ? feedback : undefined
        })
      });
      if (!response.ok) {
        throw new Error("Could not update pitching.");
      }
      setDone(next);
      setFeedbackOpen(false);
      toast.success(next ? "Pitch marked complete." : "Pitch unmarked.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update pitching.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Current stage
          </div>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Package Pitching</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {done
              ? "This group’s pitch check-in is complete."
              : "Mark the pitch check-in once this group has presented."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StageComments rowId={rowId} stage="pitching" canWrite={canEdit} />
          {canEdit ? (
            <Button
              type="button"
              disabled={saving}
              onClick={() => {
                if (done) {
                  void toggle(false);
                  return;
                }
                setFeedbackOpen(true);
              }}
            >
              {done ? "Unmark pitch" : "Mark pitch complete"}
            </Button>
          ) : null}
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

export function BrainstormingPanel({
  rowId,
  proofs,
  docUrl,
  approved,
  canEdit
}: {
  rowId: string;
  proofs: BrainstormProofView[];
  docUrl: string;
  approved: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = useState(approved);
  const [saving, setSaving] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  async function toggle(next: boolean, feedback?: string) {
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/brainstorming", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "approve",
          rowId,
          approved: next,
          feedback: next ? feedback : undefined
        })
      });
      if (!response.ok) {
        throw new Error("Could not update brainstorming.");
      }
      setDone(next);
      setFeedbackOpen(false);
      toast.success(next ? "Proof of contact approved." : "Proof of contact unmarked.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update brainstorming.");
    } finally {
      setSaving(false);
    }
  }

  const status = cycleStageStatus("brainstorming", {
    ...emptyCycleStageStatusInput(),
    proofOfContact: done,
    proofCount: proofs.length,
    brainstormDocUrl: docUrl
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Current stage
          </div>
          <h2 className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">
            Brainstorming & Proof of Contact
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review the three proofs and the group Google Doc, then approve the check-in.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StageComments rowId={rowId} stage="brainstorming" canWrite={canEdit} />
          <StageStatusChip status={status} size="lg" />
        </div>
      </div>
      <BrainstormMaterials
        proofs={proofs}
        docUrl={docUrl}
        approved={done}
        canEdit={canEdit && !saving}
        onApprove={() => {
          if (done) {
            void toggle(false);
            return;
          }
          setFeedbackOpen(true);
        }}
      />
      <ApproveFeedbackDialog
        open={feedbackOpen}
        saving={saving}
        onOpenChange={setFeedbackOpen}
        onConfirm={(feedback) => void toggle(true, feedback)}
      />
    </div>
  );
}
