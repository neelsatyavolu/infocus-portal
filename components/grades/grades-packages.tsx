"use client";

import Link from "next/link";
import { Layers, MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { cycleLabel } from "@/components/kit/format";
import { Panel } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { ClampText, LABEL_CLASS, NewTag, ScoreStat, StageTags } from "@/components/grades/grade-parts";
import { cycleScoresOf, cycleStatusOf, cycleTopic, shortDateFromIso } from "@/components/grades/grade-math";
import { cycleSeenKey } from "@/components/grades/grades-seen";
import { PACKAGE_ROW_CLASS } from "@/components/grades/grades-layout";
import type { EstimatedPayload, GradeTile } from "@/components/grades/grades-types";
import { MAX_FINAL_CUT_POINTS } from "@/src/lib/grading";
import { MAX_CHECK_IN_POINTS_PER_CYCLE, POINTS_PER_CHECK_IN } from "@/src/lib/package-stages";
import type { GradebookCheckIn } from "@/src/lib/student-gradebook";
import { cn } from "@/src/lib/utils";

/**
 * Packages: one aligned row per cycle of this semester (a list, so 1–4 cycles never leave an
 * orphan card). Each row: cycle + topic with its status tags, Final cut and Check-ins in fixed
 * columns, the four stage tags, the feedback link, and the producer note.
 */
export function GradesPackages({
  cycles,
  scoreCycles,
  estimated,
  checkInByCycle,
  newKeys,
  className
}: {
  /** This semester's cycles (the rows). */
  cycles: GradeTile[];
  /** Every cycle in order: the estimated arrays are indexed by position here. */
  scoreCycles: GradeTile[];
  estimated: EstimatedPayload | undefined;
  checkInByCycle: Map<number, GradebookCheckIn>;
  newKeys: ReadonlySet<string>;
  /** Grid placement from the Overview (grades-layout.ts). */
  className?: string;
}) {
  return (
    <Panel
      id="grades-packages"
      title="Packages"
      titleAs="h2"
      padding="none"
      className={cn("scroll-mt-20", className)}
      footer={
        <span>
          Each check-in is {POINTS_PER_CHECK_IN} points after its deadline. A/B-roll needs approval; Brainstorm and
          Initial need submission.
        </span>
      }
    >
      {cycles.length === 0 ? (
        <EmptyState icon={Layers} title="No cycles this semester yet." description="Cycle grades appear here once a cycle starts." />
      ) : (
        <ul className="divide-y divide-border">
          {cycles.map((cycle) => (
            <PackageRow
              key={cycle.cycleNumber}
              cycle={cycle}
              scores={cycleScoresOf(scoreCycles, cycle.cycleNumber, estimated)}
              stages={checkInByCycle.get(cycle.cycleNumber)}
              isNew={newKeys.has(cycleSeenKey(cycle.cycleNumber))}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function PackageRow({
  cycle,
  scores,
  stages,
  isNew
}: {
  cycle: GradeTile;
  scores: ReturnType<typeof cycleScoresOf>;
  stages: GradebookCheckIn | undefined;
  isNew: boolean;
}) {
  const status = cycleStatusOf(cycle);
  const topic = cycleTopic(cycle);
  const revisedOn = cycle.published && cycle.revised ? shortDateFromIso(cycle.revisedAt) : null;
  const note = cycle.published && cycle.feedback?.trim() ? cycle.feedback : null;
  const feedbackHref =
    cycle.published && cycle.reviewProjectId && cycle.reviewMediaId
      ? `/projects/${cycle.reviewProjectId}/review/${cycle.reviewMediaId}`
      : null;

  return (
    <li className={PACKAGE_ROW_CLASS}>
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <div className="flex min-w-0 items-baseline gap-2">
          {/* The heading says the cycle number for screen readers, so this mono label is visual only. */}
          <span aria-hidden className="shrink-0 font-mono-broadcast text-xs tabular-nums text-muted-foreground">
            {cycleLabel(cycle.cycleNumber)}
          </span>
          <h3 title={topic} className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug text-foreground">
            <span className="sr-only">{`Cycle ${cycle.cycleNumber}: `}</span>
            {topic}
          </h3>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusTag tone={status.tone} title={status.detail}>
            {status.label}
          </StatusTag>
          {isNew ? <NewTag /> : null}
          {revisedOn ? <span className="text-xs text-muted-foreground">Revised {revisedOn}</span> : null}
          <span className="sr-only">{status.detail}</span>
        </div>
      </div>

      <ScoreStat label="Final cut" value={scores.finalCut} max={MAX_FINAL_CUT_POINTS} className="sm:text-right" />
      <ScoreStat
        label="Check-ins"
        value={scores.checkIn}
        max={scores.checkPossible ?? MAX_CHECK_IN_POINTS_PER_CYCLE}
        className="sm:text-right"
      />

      <div className="col-span-2 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 sm:col-span-3">
        <StageTags stages={stages} />
        {/* A quiet text link, so a list of cycles reads as data rather than a stack of buttons. */}
        {feedbackHref ? (
          <Link
            href={feedbackHref as never}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-sm text-sm font-medium text-[var(--brand-green)] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
          >
            <MessageSquare aria-hidden className="h-4 w-4" />
            View package feedback
          </Link>
        ) : null}
      </div>

      {note ? (
        <div className="col-span-2 min-w-0 border-l-2 border-border pl-3 sm:col-span-3">
          <p className={LABEL_CLASS}>Producer note</p>
          <ClampText text={note} lines={3} className="mt-1 text-sm text-foreground" />
        </div>
      ) : null}
    </li>
  );
}
