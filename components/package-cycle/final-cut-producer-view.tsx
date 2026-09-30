"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CycleGradeReleaseCard } from "@/components/package-cycle/cycle-grade-release-card";
import {
  FinalCutGradeCard,
  type FinalCutGradeCardData,
  type FinalCutScoreInput
} from "@/components/package-cycle/final-cut-grade-card";
import { FinalCutShowCard } from "@/components/package-cycle/final-cut-show-card";
import { PackageOfCycleCard, type PackageOfCyclePanelData } from "@/components/package-cycle/package-of-cycle-card";

/**
 * Producer Final Cut tab on Groups. Top: the video beside what airs (headline, toss,
 * queue, Package of the Cycle). Below: member grades, then the shared cycle note.
 */
export function FinalCutProducerView({
  rowId,
  media,
  hasFinalCut,
  headline,
  toss,
  canEditToss,
  onEditToss,
  queued,
  onQueue,
  packageOfCycle,
  members,
  onReload,
  grade,
  onSaveGrade,
  gradeMessage,
  savingFeedback,
  publishingGrades,
  onSaveFeedback,
  onPublishGrades
}: {
  rowId: string;
  media: ReactNode;
  hasFinalCut: boolean;
  headline: string | null;
  toss: string;
  canEditToss: boolean;
  onEditToss: () => void;
  queued: boolean;
  onQueue: () => void;
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
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,1fr)]">
        <div className="min-w-0">{media}</div>
        {hasFinalCut ? (
          <div className="space-y-4">
            <FinalCutShowCard headline={headline} toss={toss} canEdit={canEditToss} onEdit={onEditToss} />
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Publishing Queue</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {queued ? "Queued for an upcoming show." : "Send it when it is ready to air."}
                </p>
              </div>
              <Button type="button" size="sm" variant={queued ? "secondary" : "default"} onClick={onQueue}>
                {queued ? "Remove from queue" : "Send to queue"}
              </Button>
            </section>
            {packageOfCycle ? (
              <PackageOfCycleCard rowId={rowId} panel={packageOfCycle} members={members} onChanged={onReload} />
            ) : null}
          </div>
        ) : null}
      </div>

      {grade ? (
        <>
          <FinalCutGradeCard
            rowId={rowId}
            grade={grade}
            onSave={onSaveGrade}
            onPenaltyChanged={onReload}
            message={gradeMessage}
          />
          <CycleGradeReleaseCard
            feedback={grade.feedback}
            published={grade.published}
            publishedAt={grade.publishedAt}
            saving={savingFeedback}
            publishing={publishingGrades}
            onSave={onSaveFeedback}
            onPublish={onPublishGrades}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Final Cut scoring is not available yet.</p>
      )}
    </div>
  );
}
