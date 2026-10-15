"use client";

import { useId } from "react";
import { ChevronDown, History, Lock, MessageSquare } from "lucide-react";
import { gradeScoreInput, gradeScoreLabel, numericGradeScore, parseGradeScore } from "@/src/lib/grade-score";
import type { CheckInStage } from "@/src/lib/package-stages";
import { IconButton } from "@/components/kit/icon-button";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import {
  CHECK_IN_LABELS,
  FINAL_CUT_REQUIRED_HINT,
  MAX_PACKAGE_PER_CYCLE,
  SCORE_GRAMMAR_HINT,
  type GradeRow
} from "./grade-editor-types";
import {
  isMissedFinalCut,
  isOverExtensions,
  isRowFilledIn,
  overExtensionsTitle,
  formatPercent,
  publishBlockedReason,
  rowLabel,
  rowStatus
} from "./grade-editor-utils";
import { checkInTone, FIELD_BOX, MONO_FIELD, percentTone, ScoreInput } from "./grade-editor-table";

/**
 * Row controls shared by the desktop table and the phone row sheet, so the input grammar,
 * disabled rules, titles and labels can't drift between them.
 */

type FieldSize = "sm" | "touch";

const HEIGHT: Record<FieldSize, string> = { sm: "h-8", touch: "h-10" };

/**
 * One check-in: N/A before it's due, otherwise Auto / 5…0 / Ungraded / Exempt. Saves on change.
 * The automatic score reads value first ("5 · auto"), so a narrow box clips the word, never the
 * number, and auto vs override is told apart by the word as well as the green border. The table
 * box has no chevron (its room goes to the value, as before the redesign); the phone sheet's has one.
 */
export function CheckInField({
  row,
  stage,
  disabled,
  onChange,
  size = "sm"
}: {
  row: GradeRow;
  stage: CheckInStage;
  disabled: boolean;
  onChange: (value: string) => void;
  size?: FieldSize;
}) {
  const score = row.checkInScores[stage];
  const override = row.checkInOverrides[stage];
  if (score === null) {
    return (
      <span
        title="Not due yet, or not on this cycle"
        className={cn("flex w-full items-center justify-center text-xs text-muted-foreground", HEIGHT[size])}
      >
        N/A
      </span>
    );
  }
  return (
    <span className="relative block w-full">
      <select
        aria-label={`${rowLabel(row)} ${CHECK_IN_LABELS[stage]} score`}
        title={override === null ? "Automatic from the stage deadline" : "Manual override"}
        value={override ?? "auto"}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          FIELD_BOX,
          "w-full appearance-none truncate text-xs [&>option]:bg-popover [&>option]:text-popover-foreground",
          size === "touch" ? "h-10 pl-2 pr-7 text-base md:text-xs" : "h-8 px-1",
          override !== null && "border-[var(--brand-green)]",
          checkInTone(score)
        )}
      >
        <option value="auto">{override === null ? `${gradeScoreLabel(score)} · auto` : "Auto"}</option>
        {[5, 4, 3, 2, 1, 0].map((points) => (
          <option key={points} value={points}>
            {points}
          </option>
        ))}
        <option value="UNGRADED">Ungraded</option>
        <option value="EXEMPT">Exempt</option>
      </select>
      {size === "touch" ? (
        <ChevronDown aria-hidden className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      ) : null}
    </span>
  );
}

/** The Final Cut score box (out of 50). Typing saves after a short pause. */
export function ScoreField({
  row,
  onChange,
  size = "sm",
  navKey
}: {
  row: GradeRow;
  onChange: (patch: Pick<GradeRow, "effortPoints" | "finalCutState" | "teamworkPoints">) => void;
  size?: FieldSize;
  navKey?: string;
}) {
  return (
    <ScoreInput
      label={`${rowLabel(row)} Final Cut score`}
      value={gradeScoreInput(row.finalCutState ?? row.effortPoints)}
      max={null}
      size={size}
      width={size === "touch" ? "w-12" : "w-11"}
      navKey={navKey}
      placeholder={isMissedFinalCut(row) ? "0" : "—"}
      title={row.published ? `Editing unpublishes this grade until you publish again. ${SCORE_GRAMMAR_HINT}` : SCORE_GRAMMAR_HINT}
      onChange={(raw) => {
        const score = parseGradeScore(raw, MAX_PACKAGE_PER_CYCLE);
        if (score === undefined) return;
        onChange({
          effortPoints: numericGradeScore(score),
          finalCutState: typeof score === "string" ? score : null,
          teamworkPoints: 0
        });
      }}
    />
  );
}

/**
 * The score beside the score box as a percentage of 50, to one decimal (0.0% when missed), or the
 * word Exempt for an exempt Final Cut. Revision caps are in the score; any late penalty is not
 * (the client never receives the penalized points), so it never claims to be the final result.
 */
export function ScorePercent({ row }: { row: GradeRow }) {
  const missed = isMissedFinalCut(row);
  const exempt = row.finalCutState === "EXEMPT";
  const points = row.effortPoints ?? (missed ? 0 : null);
  const percent = points === null ? null : (points / MAX_PACKAGE_PER_CYCLE) * 100;
  return (
    <span
      title={
        missed
          ? "No approved Final Cut by the deadline"
          : exempt
            ? "Exempt: left out of totals"
            : percent === null
              ? undefined
              : `Out of ${MAX_PACKAGE_PER_CYCLE}, before any late penalty`
      }
      className={cn(
        "inline-block w-10 text-right font-mono-broadcast text-[11px] tabular-nums",
        missed ? "text-danger" : exempt ? "text-muted-foreground" : percentTone(percent)
      )}
    >
      {exempt ? "Exempt" : formatPercent(percent)}
    </span>
  );
}

/** Turned in date. Locked (neutral, with the reason on hover) until the cycle has a Final Cut date. */
export function TurnedInField({
  row,
  locked,
  onChange,
  size = "sm"
}: {
  row: GradeRow;
  locked: boolean;
  onChange: (value: string | null) => void;
  size?: FieldSize;
}) {
  return (
    <input
      type="date"
      value={row.turnedInDate ?? ""}
      disabled={locked}
      title={locked ? FINAL_CUT_REQUIRED_HINT : undefined}
      aria-label={`Turned In date for ${rowLabel(row)}`}
      onChange={(event) => onChange(event.target.value || null)}
      className={cn(
        MONO_FIELD,
        "w-full text-xs [color-scheme:dark] light:[color-scheme:light]",
        size === "touch" ? "h-10 px-2 text-base md:text-xs" : "h-8 px-1",
        locked && "border-dashed text-muted-foreground"
      )}
    />
  );
}

export function LockedColumnIcon() {
  return <Lock aria-label="Locked" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}

/**
 * A row's one status tag (Published, Revised, Unpublished, Not entered, Missed, Exempt, Ungraded).
 * A grade changed after publishing and published again reads Published; its tag's hover text
 * and the publish history say it was revised.
 */
export function RowStatusTag({ row, size = "sm" }: { row: GradeRow; size?: "sm" | "md" }) {
  const status = rowStatus(row);
  return (
    <StatusTag tone={status.tone} size={size} title={status.title}>
      {status.label}
    </StatusTag>
  );
}

/** Season-wide: used more extension days than they have. Shown beside the reporter. */
export function OverExtensionsTag({ row, size = "sm" }: { row: GradeRow; size?: "sm" | "md" }) {
  if (!isOverExtensions(row)) return null;
  return (
    <StatusTag tone="warning" size={size} title={overExtensionsTitle(row)}>
      Over ext.
    </StatusTag>
  );
}

/** Saving / Unsaved / Not saved for one row, as a tag like every other status on the page. */
export function RowSaveMark({
  saving,
  dirty,
  failed,
  size = "sm"
}: {
  saving: boolean;
  dirty: boolean;
  failed: boolean;
  size?: "sm" | "md";
}) {
  if (saving) {
    return (
      <StatusTag tone="neutral" size={size} spinner>
        Saving
      </StatusTag>
    );
  }
  if (failed && dirty) {
    return (
      <StatusTag tone="danger" size={size} title="This row didn't save. It tries again on the next edit, or use Save all">
        Not saved
      </StatusTag>
    );
  }
  if (dirty) {
    return (
      <StatusTag tone="warning" size={size} title="Saves on its own in a moment">
        Unsaved
      </StatusTag>
    );
  }
  return null;
}

/** Publish / Unpublish for one row, with the reason on hover when it can't publish. */
export function PublishButton({
  row,
  publishing,
  disabled,
  onClick,
  size = "sm",
  className
}: {
  row: GradeRow;
  publishing: boolean;
  /** Busy elsewhere (Save all, Publish all, this row saving). */
  disabled: boolean;
  onClick: () => void;
  size?: FieldSize;
  className?: string;
}) {
  const blocked = publishBlockedReason(row);
  const canPublishRow = isRowFilledIn(row);
  const reasonId = useId();
  const button = (
    <Button
      type="button"
      variant="outline"
      size={size === "touch" ? "lg" : "sm"}
      onClick={onClick}
      disabled={disabled || publishing || (!row.published && !canPublishRow)}
      aria-describedby={blocked ? reasonId : undefined}
      className={cn(
        size === "touch" ? "w-full px-4" : "min-w-[84px] px-2.5",
        !row.published && canPublishRow && "text-[var(--brand-green)]",
        className
      )}
    >
      {publishing ? <Spinner /> : null}
      {row.published ? "Unpublish" : "Publish"}
    </Button>
  );
  // A disabled button can't show a tooltip or take focus, so the reason is on hover (wrapper)
  // and read out with the button (aria-describedby) for keyboard and screen-reader users.
  return blocked ? (
    <span title={blocked} className={cn(size === "touch" && "block w-full")}>
      {button}
      <span id={reasonId} className="sr-only">
        {blocked}
      </span>
    </span>
  ) : (
    button
  );
}

/** Feedback icon button: green when feedback exists. */
export function FeedbackButton({ row, onClick }: { row: GradeRow; onClick: () => void }) {
  const hasFeedback = Boolean(row.feedback.trim());
  return (
    <IconButton
      label={`${hasFeedback ? "View" : "Add"} feedback for ${rowLabel(row)}`}
      icon={MessageSquare}
      size="sm"
      variant="outline"
      active={hasFeedback}
      onClick={onClick}
    />
  );
}

/** Publish history (only when there is some); an empty slot of the same size otherwise. */
export function HistoryButton({ row, onClick }: { row: GradeRow; onClick: () => void }) {
  if (row.publicationHistory.length === 0) return <span aria-hidden className="h-8 w-8 shrink-0" />;
  return <IconButton label={`View publish history for ${rowLabel(row)}`} icon={History} size="sm" variant="ghost" onClick={onClick} />;
}
