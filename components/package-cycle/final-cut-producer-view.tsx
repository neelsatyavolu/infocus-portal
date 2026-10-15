"use client";

import type { ReactNode } from "react";
import { Award } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { CycleGradeReleaseCard } from "@/components/package-cycle/cycle-grade-release-card";
import {
  FinalCutGradeCard,
  type FinalCutGradeCardData,
  type FinalCutScoreInput
} from "@/components/package-cycle/final-cut-grade-card";
import { FinalCutShowCard } from "@/components/package-cycle/final-cut-show-card";
import { PackageOfCycleCard, type PackageOfCyclePanelData } from "@/components/package-cycle/package-of-cycle-card";

/** Which button is the view's one filled (primary) action. */
export type FinalCutPrimaryAction = "save" | "publish" | "queue" | null;

/**
 * The next thing this viewer has to do on a Final Cut. Graders: Publish grades once every member
 * has an official grade, otherwise Save my scores. Everyone else: Send to queue until it is
 * queued, then Publish grades when it is ready.
 */
export function finalCutPrimaryAction(input: {
  canGrade: boolean;
  canSaveScores: boolean;
  hasFinalCut: boolean;
  queued: boolean;
  gradesReadyToPublish: boolean;
}): FinalCutPrimaryAction {
  if (input.canGrade) {
    if (input.gradesReadyToPublish) return "publish";
    return input.canSaveScores ? "save" : null;
  }
  if (input.hasFinalCut && !input.queued) return "queue";
  return input.gradesReadyToPublish ? "publish" : null;
}

/**
 * Producer Final Cut tab on Groups. Top: the video with what airs (headline and toss) under it,
 * and the rail with the feedback thread, then Package of the Cycle. Below, full width: member
 * grades, then the shared cycle note. Send to queue lives in the stage's decision bar.
 */
export function FinalCutProducerView({
  rowId,
  media,
  feedback,
  hasFinalCut,
  headline,
  toss,
  canEditToss,
  onEditToss,
  packageOfCycle,
  members,
  onReload,
  grade,
  onSaveGrade,
  gradeMessage,
  savingFeedback,
  publishingGrades,
  onSaveFeedback,
  onPublishGrades,
  primaryAction = null
}: {
  rowId: string;
  media: ReactNode;
  /** The stage's feedback panel, first in the rail. */
  feedback?: ReactNode;
  hasFinalCut: boolean;
  headline: string | null;
  toss: string;
  canEditToss: boolean;
  onEditToss: () => void;
  packageOfCycle: PackageOfCyclePanelData | null;
  members: Array<{ userId: string; name: string | null; email: string | null }>;
  onReload: () => void;
  grade: FinalCutGradeCardData | null;
  onSaveGrade: (scores: FinalCutScoreInput[]) => Promise<void>;
  gradeMessage: string | null;
  savingFeedback: boolean;
  publishingGrades: boolean;
  onSaveFeedback: (feedback: string) => void;
  onPublishGrades: (feedback: string) => void;
  primaryAction?: FinalCutPrimaryAction;
}) {
  return (
    <div className="space-y-5">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-5">
          {media}
          {hasFinalCut ? (
            <FinalCutShowCard headline={headline} toss={toss} canEdit={canEditToss} onEdit={onEditToss} />
          ) : null}
        </div>
        <div className="min-w-0 space-y-5">
          {feedback}
          {hasFinalCut && packageOfCycle ? (
            <PackageOfCycleCard rowId={rowId} panel={packageOfCycle} members={members} onChanged={onReload} />
          ) : null}
        </div>
      </div>

      {grade ? (
        <>
          <FinalCutGradeCard
            rowId={rowId}
            grade={grade}
            onSave={onSaveGrade}
            onPenaltyChanged={onReload}
            message={gradeMessage}
            savePrimary={primaryAction === "save"}
          />
          <CycleGradeReleaseCard
            feedback={grade.feedback}
            published={grade.published}
            publishedAt={grade.publishedAt}
            saving={savingFeedback}
            publishing={publishingGrades}
            publishPrimary={primaryAction === "publish"}
            onSave={onSaveFeedback}
            onPublish={onPublishGrades}
          />
        </>
      ) : (
        <section aria-label="Grading" className="rounded-md border border-border bg-card">
          <EmptyState icon={Award} title="Final Cut scoring is not available yet." />
        </section>
      )}
    </div>
  );
}
