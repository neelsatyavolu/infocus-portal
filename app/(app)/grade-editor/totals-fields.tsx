"use client";

import type { TotalsAdjustments } from "@/src/lib/grade-editor-csv";
import { gradeScoreInput, parseGradeScore } from "@/src/lib/grade-score";
import { REQUIRED_LIVESTREAM_HOURS } from "@/src/lib/livestream";
import { cn } from "@/src/lib/utils";
import { MAX_FINAL, MAX_LIVESTREAM, type TotalsCycleEntry, type TotalsRow } from "./grade-editor-types";
import { clampNonNegative, nextCycleOverrides } from "./grade-editor-utils";
import { MONO_FIELD, ScoreInput } from "./grade-editor-table";

/**
 * Total-view inputs shared by the desktop table and the phone sheet. Every edit here is
 * temporary: it changes this page and the CSV, never a saved grade.
 */

type Size = "sm" | "touch";
type Update = (patch: Partial<TotalsAdjustments>) => void;

function studentLabel(row: TotalsRow) {
  return row.name ?? "Student";
}

/** One cycle: the official score (read-only, red when missed) or a dashed temporary override. */
export function CycleTotalField({
  row,
  entry,
  adjustments,
  update,
  size = "sm"
}: {
  row: TotalsRow;
  entry: TotalsCycleEntry;
  adjustments: TotalsAdjustments;
  update: Update;
  size?: Size;
}) {
  if (entry.totalPoints !== null) {
    return (
      <span
        className={cn(
          "grid w-12 place-items-center font-mono-broadcast text-[13px] font-medium tabular-nums",
          size === "touch" ? "h-10" : "h-8",
          entry.missing ? "text-danger" : "text-foreground"
        )}
        title={entry.missing ? "No approved Final Cut by the deadline" : undefined}
      >
        {entry.totalPoints}
      </span>
    );
  }
  const override = adjustments.cycleOverrides[entry.cycleNumber];
  return (
    <ScoreInput
      label={`${studentLabel(row)} Cycle ${entry.cycleNumber} score`}
      value={override ?? gradeScoreInput(entry.finalCutState ?? null)}
      max={null}
      dashed
      size={size}
      navKey={`total-cycle-${entry.cycleNumber}`}
      title="Temporary score for this page and the CSV. Enter points, - for ungraded, or \ for exempt"
      onChange={(raw) => {
        const nextOverrides = nextCycleOverrides(adjustments.cycleOverrides, entry.cycleNumber, raw);
        if (nextOverrides) update({ cycleOverrides: nextOverrides });
      }}
    />
  );
}

export function CheckInsTotalField({
  row,
  adjustments,
  checkInMax,
  update,
  size = "sm"
}: {
  row: TotalsRow;
  adjustments: TotalsAdjustments;
  checkInMax: number;
  update: Update;
  size?: Size;
}) {
  return (
    <ScoreInput
      label={`${studentLabel(row)} checkIns score`}
      value={gradeScoreInput(adjustments.checkIns)}
      max={checkInMax}
      size={size}
      navKey="total-checkins"
      onChange={(raw) => {
        const score = parseGradeScore(raw, checkInMax);
        if (score !== undefined) update({ checkIns: score });
      }}
    />
  );
}

/** "x/8 hrs" completed, then the livestream score out of 40. */
export function LivestreamField({
  row,
  adjustments,
  update,
  size = "sm"
}: {
  row: TotalsRow;
  adjustments: TotalsAdjustments;
  update: Update;
  size?: Size;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="whitespace-nowrap font-mono-broadcast text-[11px] tabular-nums text-muted-foreground"
        title={`${row.livestreamHours}/${REQUIRED_LIVESTREAM_HOURS} hours completed`}
      >
        {row.livestreamHours}/{REQUIRED_LIVESTREAM_HOURS} hrs
      </span>
      <ScoreInput
        label={`${studentLabel(row)} livestream score`}
        value={gradeScoreInput(adjustments.livestream)}
        max={null}
        size={size}
        navKey="total-livestream"
        onChange={(raw) => {
          const score = parseGradeScore(raw, MAX_LIVESTREAM);
          if (score !== undefined) update({ livestream: score });
        }}
      />
    </span>
  );
}

export function FinalField({
  row,
  adjustments,
  update,
  size = "sm"
}: {
  row: TotalsRow;
  adjustments: TotalsAdjustments;
  update: Update;
  size?: Size;
}) {
  return (
    <ScoreInput
      label={`${studentLabel(row)} final score`}
      value={gradeScoreInput(adjustments.final)}
      max={null}
      size={size}
      navKey="total-final"
      onChange={(raw) => {
        const score = parseGradeScore(raw, MAX_FINAL);
        if (score !== undefined) update({ final: score });
      }}
    />
  );
}

/** Extra credit: earned / possible. */
export function ExtraField({
  row,
  adjustments,
  update,
  size = "sm"
}: {
  row: TotalsRow;
  adjustments: TotalsAdjustments;
  update: Update;
  size?: Size;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <ScoreInput
        label={`${studentLabel(row)} extraPoints score`}
        value={gradeScoreInput(adjustments.extraPoints)}
        max={null}
        width="w-10"
        size={size}
        placeholder="0"
        navKey="total-extra"
        onChange={(raw) => {
          const score = parseGradeScore(raw, Number.MAX_SAFE_INTEGER);
          if (score !== undefined) update({ extraPoints: score });
        }}
      />
      <span className="font-mono-broadcast text-xs text-muted-foreground">/</span>
      <input
        aria-label={`${studentLabel(row)} extra points possible`}
        value={adjustments.extraMax}
        inputMode="numeric"
        onChange={(event) => update({ extraMax: clampNonNegative(event.target.value) })}
        className={cn(MONO_FIELD, "w-10 shrink-0 px-1 text-center", size === "touch" ? "h-10 text-base md:text-[13px]" : "h-8")}
        placeholder="0"
      />
    </span>
  );
}
