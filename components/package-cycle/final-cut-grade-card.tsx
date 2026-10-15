"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, InlineError } from "@/components/kit/alert";
import { Disclosure } from "@/components/kit/disclosure";
import { Panel } from "@/components/kit/panel";
import { useMediaQuery } from "@/components/kit/remembered-state";
import { StatusTag } from "@/components/kit/status-tag";
import { StickyActionBar } from "@/components/kit/sticky-action-bar";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import {
  draftFrom,
  draftIsDirty,
  formatGradeDay,
  lateStatus,
  scoresFromDraft,
  type GradeDraft
} from "@/components/package-stages/grade-helpers";
import { MemberGradeCards, MemberGradeTable } from "@/components/package-stages/grade-members";

export type FinalCutMemberGradeData = {
  userId: string;
  name: string | null;
  email: string | null;
  myQuality: number | null;
  myEffort: number | null;
  locked: boolean;
  complete: boolean;
  pendingCount: number;
  qualityAverage: number | null;
  effortAverage: number | null;
  average: number | null;
  afterRevisionCap: number | null;
  revisionCapped: boolean;
  officialPoints: number | null;
  revisionCount: number;
  secondRevisionEligible: boolean;
  daysLate: number;
  /** Penalty that applies: the exec override when set, otherwise the automatic one. */
  penaltyMultiplier: number;
  automaticPenaltyMultiplier: number;
  /** Exec override percent; null = automatic. */
  latePenaltyPercent: number | null;
  graderScores: Array<{
    userId: string;
    name: string;
    required: boolean;
    quality: number | null;
    effort: number | null;
  }>;
};

export type FinalCutGradeCardData = {
  canGrade: boolean;
  complete: boolean;
  viewerUserId: string;
  deadlineAt: string | null;
  turnedInAt: string | null;
  extensionDays: number;
  daysLate: number;
  penaltyMultiplier: number;
  blocksSecondRevision: boolean;
  secondRevisionEligible: boolean;
  feedback: string;
  published: boolean;
  publishedAt: string | null;
  members: FinalCutMemberGradeData[];
  graders: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    required: boolean;
    scoredCount: number;
  }>;
};

export type FinalCutScoreInput = { memberUserId: string; qualityPoints: number; effortPoints: number };

const CAPS = "text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground";

/** Deadline / Submitted / Deduction as three equal cells in one card. */
function TimingStrip({ grade }: { grade: FinalCutGradeCardData }) {
  const cells = [
    {
      label: "Deadline",
      value: formatGradeDay(grade.deadlineAt),
      detail: grade.extensionDays > 0 ? `Includes +${grade.extensionDays} extension days` : "No extension"
    },
    {
      label: "Submitted",
      value: formatGradeDay(grade.turnedInAt),
      detail:
        grade.daysLate > 0 ? `${grade.daysLate} day${grade.daysLate === 1 ? "" : "s"} late` : "On or before deadline"
    },
    {
      label: "Deduction",
      value: grade.penaltyMultiplier > 0 ? `−${Math.round(grade.penaltyMultiplier * 100)}% late` : "None",
      detail: grade.blocksSecondRevision
        ? "30% cannot be repaired"
        : grade.penaltyMultiplier > 0
          ? "Taken off the official grade"
          : grade.secondRevisionEligible
            ? "Second revision still allowed"
            : "No late deduction"
    }
  ];
  return (
    <dl className="grid grid-cols-1 divide-y divide-border rounded-md border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0 px-4 py-3">
          <dt className={CAPS}>{cell.label}</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{cell.value}</dd>
          <dd className="text-[13px] text-muted-foreground">{cell.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Each executive producer's progress through the members, as tags after a GRADERS label. */
function GraderProgress({ grade, scoringMembers }: { grade: FinalCutGradeCardData; scoringMembers: number }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className={CAPS}>Graders</span>
      {grade.graders.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No executive producers are assigned yet.</p>
      ) : (
        <ul className="flex min-w-0 flex-wrap gap-1.5" aria-label="Executive producer progress">
          {grade.graders.map((grader) => {
            const done = scoringMembers > 0 && grader.scoredCount >= scoringMembers;
            return (
              <li key={grader.userId} className="min-w-0">
                <StatusTag tone={done ? "success" : "neutral"}>
                  {grader.name || grader.email || "Executive producer"}
                  {grader.userId === grade.viewerUserId ? " (you)" : ""}
                  {grader.required ? "" : " · optional"}
                  {" · "}
                  {done ? "Done" : `${Math.min(grader.scoredCount, scoringMembers)}/${scoringMembers}`}
                </StatusTag>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Member grades for a Final Cut: timing, how grading works (folded), every member's scores
 * (a table on wide screens, cards on phones), late penalties, and Save my scores. On phones the
 * Save bar sticks above the tab bar while typed scores are unsaved. A score problem shows in full
 * as its own line above Save (scrolled into view), apart from the saved message.
 */
export function FinalCutGradeCard({
  rowId,
  grade,
  onSave,
  onPenaltyChanged,
  message,
  savePrimary = true
}: {
  rowId: string;
  grade: FinalCutGradeCardData;
  onSave: (scores: FinalCutScoreInput[]) => Promise<void>;
  onPenaltyChanged: () => void;
  message?: string | null;
  /** Save my scores is the view's one filled button (false when Publish Grades is next). */
  savePrimary?: boolean;
}) {
  const timing = lateStatus(grade);
  const [draft, setDraft] = useState<GradeDraft>(() => draftFrom(grade.members));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingPenaltyFor, setSavingPenaltyFor] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const wide = useMediaQuery("(min-width: 1280px)");

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [error]);
  // Reset typed scores only when saved scores change, so unrelated reloads keep unsaved input.
  const savedKey = grade.members.map((member) => `${member.userId}:${member.myQuality}:${member.myEffort}`).join("|");
  const [draftSavedKey, setDraftSavedKey] = useState(savedKey);
  if (savedKey !== draftSavedKey) {
    setDraftSavedKey(savedKey);
    setDraft(draftFrom(grade.members));
  }

  const scoringMembers = grade.members.filter((member) => !member.locked).length;
  const canSave = grade.canGrade && scoringMembers > 0;
  const dirty = canSave && draftIsDirty(grade.members, draft);

  async function save() {
    const result = scoresFromDraft(grade.members, draft);
    if ("error" in result) {
      setError(result.error ?? null);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(result.scores);
    } finally {
      setSaving(false);
    }
  }

  async function savePenalty(memberUserId: string, percent: number | null) {
    setSavingPenaltyFor(memberUserId);
    try {
      const response = await fetch("/api/package-cycle/grade", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId, memberUserId, percent })
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        toast.error(body.error?.message ?? "Could not change the late penalty.");
        return;
      }
      toast.success(percent === null ? "Late penalty set back to automatic." : `Late penalty set to ${percent}%.`);
      onPenaltyChanged();
    } catch {
      toast.error("Could not change the late penalty.");
    } finally {
      setSavingPenaltyFor(null);
    }
  }

  const rows = {
    members: grade.members,
    canGrade: grade.canGrade,
    viewerUserId: grade.viewerUserId,
    draft,
    onDraftChange: (memberUserId: string, next: { quality: string; effort: string }) =>
      setDraft((current) => ({ ...current, [memberUserId]: next })),
    savingPenaltyFor,
    onPenaltyChange: (memberUserId: string, percent: number | null) => void savePenalty(memberUserId, percent)
  };

  const saveButton = (
    <Button type="button" variant={savePrimary ? "default" : "outline"} disabled={saving} onClick={() => void save()}>
      {saving ? <Spinner /> : null}
      {saving ? "Saving…" : "Save my scores"}
    </Button>
  );
  const footerStatus = message ? (
    <span role="status">{message}</span>
  ) : !grade.canGrade ? (
    "Only executive producers enter scores."
  ) : null;

  return (
    <Panel
      id="member-grades"
      title="Member grades"
      titleAs="h2"
      status={
        <StatusTag tone={timing.tone} title={timing.detail}>
          {timing.label}
        </StatusTag>
      }
      padding="md"
      bodyClassName="space-y-4"
    >
      <GraderProgress grade={grade} scoringMembers={scoringMembers} />
      <TimingStrip grade={grade} />
      {grade.daysLate > 0 && grade.blocksSecondRevision ? (
        <Alert tone="danger" compact>
          {timing.detail}
        </Alert>
      ) : null}
      <Disclosure summary="How grading works" storageKey="package-stages:grading-how:v1">
        <p className="max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
          Each executive producer scores every member: quality out of 25 and effort out of 25. A member&apos;s official
          grade is the average of those totals, then any revision cap and late deduction.
        </p>
      </Disclosure>

      {grade.members.length === 0 ? (
        <p className="text-sm text-muted-foreground">This package has no members.</p>
      ) : wide ? (
        <MemberGradeTable {...rows} />
      ) : (
        <MemberGradeCards {...rows} />
      )}

      {error ? (
        <div ref={errorRef}>
          <InlineError>{error}</InlineError>
        </div>
      ) : null}

      {canSave && dirty ? (
        <StickyActionBar status={footerStatus} inlineFrom="lg">
          {saveButton}
        </StickyActionBar>
      ) : canSave || footerStatus ? (
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-3 text-[13px] text-muted-foreground">
          <div className="min-w-0">{footerStatus}</div>
          {canSave ? saveButton : null}
        </div>
      ) : null}
    </Panel>
  );
}
