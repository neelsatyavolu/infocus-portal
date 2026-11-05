"use client";

import { useId } from "react";
import { ArrowLeft, Save, Send } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { EmptyState } from "@/components/kit/empty-state";
import { Sheet } from "@/components/kit/sheet";
import { Skeleton } from "@/components/kit/skeleton";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_EFFORT_POINTS, MAX_TEAMWORK_POINTS } from "@/src/lib/package-grades";
import { cn } from "@/src/lib/utils";
import {
  extensionDaysTone,
  MAX_FEEDBACK_LENGTH,
  MAX_FREE_EXTENSION_DAYS,
  normalizeFreeExtensionDays,
  normalizeQuickGradePoints,
  quickGradePersonLabel,
  type QuickGradeRow
} from "@/components/review/quick-grades";
import type { QuickGradesState } from "@/components/review/use-quick-grades";

const LABEL_CLASS = "text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground";
const NUMBER_INPUT_CLASS = "h-9 px-2 text-right font-mono-broadcast tabular-nums";

function cycleTitle(cycleNumber: number | null) {
  return cycleNumber ? `Cycle ${cycleNumber}` : "Cycle unavailable";
}

function showFooter(state: QuickGradesState, peopleCount: number) {
  return Boolean(state.cycleNumber) && !state.loading && peopleCount > 0;
}

function GradeRow({ row, state }: { row: QuickGradeRow; state: QuickGradesState }) {
  const name = quickGradePersonLabel(row);
  const editorOpen = state.feedbackEditorUserId === row.userId && !row.disabled;
  const inputsDisabled = row.disabled || state.saving;
  const editorId = `quick-grade-feedback-${row.userId}`;

  return (
    <li className={cn("space-y-2.5 rounded-md border border-border p-3", row.disabled && "bg-[var(--ink-2)]")}>
      <div className="flex min-h-8 min-w-0 items-center gap-2">
        <span className={cn("min-w-0 truncate text-sm font-medium", row.disabled ? "text-muted-foreground" : "text-foreground")}>
          {name}
        </span>
        {!row.disabled && !row.extensionDetails.exempt ? (
          <StatusTag
            size="sm"
            tone={extensionDaysTone(row.extensionsRemaining)}
            title="Extension days remaining (out of 14)"
            className="font-mono! normal-case! tracking-normal! tabular-nums"
          >
            {`${row.extensionsRemaining}d`}
          </StatusTag>
        ) : null}
        <span className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={inputsDisabled}
          aria-expanded={editorOpen}
          aria-controls={editorOpen ? editorId : undefined}
          onClick={() => state.setFeedbackEditorUserId(editorOpen ? null : row.userId)}
        >
          {row.feedback.trim() ? "Edit feedback" : "Add feedback"}
        </Button>
      </div>
      {row.disabled ? <p className="text-xs text-muted-foreground">{row.disabledReason}</p> : null}
      <div className="grid grid-cols-3 gap-2">
        <Input
          type="number"
          min={0}
          max={MAX_EFFORT_POINTS}
          step={1}
          inputMode="numeric"
          aria-label={`Effort for ${name} (out of ${MAX_EFFORT_POINTS})`}
          value={row.effortPoints ?? ""}
          disabled={inputsDisabled}
          onChange={(event) =>
            state.updateRow(row.userId, { effortPoints: normalizeQuickGradePoints(event.target.value, MAX_EFFORT_POINTS) })
          }
          className={NUMBER_INPUT_CLASS}
        />
        <Input
          type="number"
          min={0}
          max={MAX_TEAMWORK_POINTS}
          step={1}
          inputMode="numeric"
          aria-label={`Teamwork for ${name} (out of ${MAX_TEAMWORK_POINTS})`}
          value={row.teamworkPoints ?? ""}
          disabled={inputsDisabled}
          onChange={(event) =>
            state.updateRow(row.userId, {
              teamworkPoints: normalizeQuickGradePoints(event.target.value, MAX_TEAMWORK_POINTS)
            })
          }
          className={NUMBER_INPUT_CLASS}
        />
        <Input
          type="number"
          min={0}
          max={MAX_FREE_EXTENSION_DAYS}
          step={1}
          inputMode="numeric"
          aria-label={`Free extension days for ${name}`}
          value={row.freeExtensionDays}
          disabled={inputsDisabled}
          onChange={(event) => state.updateRow(row.userId, { freeExtensionDays: normalizeFreeExtensionDays(event.target.value) })}
          className={NUMBER_INPUT_CLASS}
        />
      </div>
      {editorOpen ? (
        <div id={editorId} className="space-y-2 border-t border-border pt-2.5">
          <Textarea
            value={row.feedback}
            onChange={(event) => state.updateRow(row.userId, { feedback: event.target.value.slice(0, MAX_FEEDBACK_LENGTH) })}
            disabled={state.saving}
            rows={4}
            aria-label={`Feedback for ${name}`}
            placeholder="Add feedback for this student..."
            className="min-h-24 resize-y"
          />
          <div className="flex items-center gap-2">
            <span className="font-mono-broadcast text-xs tabular-nums text-muted-foreground">
              {row.feedback.length}/{MAX_FEEDBACK_LENGTH}
            </span>
            <span className="flex-1" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={state.saving}
              onClick={() => state.updateRow(row.userId, { feedback: "" })}
            >
              Clear
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => state.setFeedbackEditorUserId(null)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** The grade rows (or the no-cycle / loading / nobody-assigned state). */
export function QuickGradesBody({ state, peopleCount }: { state: QuickGradesState; peopleCount: number }) {
  if (!state.cycleNumber) {
    return (
      <Alert tone="warning" compact>
        Project name must match <span className="font-medium">Package Cycle X</span> to load grades.
      </Alert>
    );
  }
  if (state.loading) {
    return (
      <div role="status" aria-label="Loading grades…" className="space-y-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-2.5 rounded-md border border-border p-3">
            <Skeleton className="h-4 w-1/2" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-9 rounded-md" />
              <Skeleton className="h-9 rounded-md" />
              <Skeleton className="h-9 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (peopleCount === 0) {
    return <EmptyState size="inline" title="No people are assigned to this video." className="px-0" />;
  }
  return (
    <div className="space-y-2">
      <div aria-hidden className="grid grid-cols-3 gap-2 px-3">
        <span className={cn(LABEL_CLASS, "text-right")}>Effort /{MAX_EFFORT_POINTS}</span>
        <span className={cn(LABEL_CLASS, "text-right")}>Teamwork /{MAX_TEAMWORK_POINTS}</span>
        <span className={cn(LABEL_CLASS, "text-right")}>Free ext</span>
      </div>
      <ul className="space-y-2">
        {state.rows.map((row) => (
          <GradeRow key={row.userId} row={row} state={state} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Turned in (for everyone), Publish all and Save assigned, the revision deadline and the result.
 * Save assigned is the filled button unless the page already shows one (`primary={false}`).
 */
export function QuickGradesFooter({
  state,
  primary = true,
  className
}: {
  state: QuickGradesState;
  primary?: boolean;
  className?: string;
}) {
  const dateId = useId();
  const disabled = state.saving || state.loading || !state.cycleNumber;
  return (
    <div className={cn("w-full space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={dateId} className={LABEL_CLASS}>
          Turned in
        </label>
        <Input
          id={dateId}
          type="date"
          value={state.sharedTurnedInDate}
          disabled={disabled}
          aria-describedby={`${dateId}-hint`}
          onChange={(event) => state.setSharedTurnedInDate(event.target.value)}
          className="h-9 w-auto"
        />
        <span id={`${dateId}-hint`} className="text-xs text-muted-foreground">
          Applies to everyone
        </span>
        <span className="flex-1" />
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" disabled={disabled} onClick={() => void state.publish()}>
            {state.saving ? <Spinner /> : <Send aria-hidden />}
            Publish all
          </Button>
          <Button type="button" variant={primary ? "default" : "secondary"} disabled={disabled} onClick={() => void state.save()}>
            {state.saving ? <Spinner /> : <Save aria-hidden />}
            Save assigned
          </Button>
        </div>
      </div>
      {state.revisionDeadlineLabel ? (
        <p className="text-xs text-muted-foreground">Latest revision by: {state.revisionDeadlineLabel}</p>
      ) : null}
      <p aria-live="polite" className={cn("text-xs text-muted-foreground", !state.message && "sr-only")}>
        {state.message}
      </p>
    </div>
  );
}

/**
 * Quick grades in the comments panel's place (desktop split), so the Final Cut stays in view and
 * keeps playing while the EP grades. Non-modal. "Back to comments" (or Grades again) returns to
 * the comments; the rows, date and feedback stay as they were.
 */
export function QuickGradesPanel({
  state,
  projectName,
  peopleCount,
  primary,
  id,
  className
}: {
  state: QuickGradesState;
  projectName: string;
  peopleCount: number;
  /** False when the header already has the page's filled button. */
  primary: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} aria-label="Quick grades" className={cn("flex min-h-0 flex-col rounded-md border border-border bg-card", className)}>
      <div className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className={LABEL_CLASS}>Quick grades</p>
          <h2 className="mt-0.5 flex items-center gap-2 text-base font-semibold text-foreground">
            {cycleTitle(state.cycleNumber)}
            {state.loading ? <Spinner label="Loading grades" /> : null}
          </h2>
          <p className="truncate text-xs text-muted-foreground">{projectName}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={state.close}>
          <ArrowLeft aria-hidden />
          Back to comments
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        <QuickGradesBody state={state} peopleCount={peopleCount} />
      </div>
      {showFooter(state, peopleCount) ? (
        <div className="shrink-0 border-t border-border px-4 py-3">
          <QuickGradesFooter state={state} primary={primary} />
        </div>
      ) : null}
    </section>
  );
}

/** Quick grades below the split layout: a bottom sheet on phones, a side drawer on tablets. */
export function QuickGradesSheet({
  state,
  projectName,
  peopleCount
}: {
  state: QuickGradesState;
  projectName: string;
  peopleCount: number;
}) {
  return (
    <Sheet
      open={state.open}
      onOpenChange={(next) => (next ? state.show() : state.close())}
      eyebrow="Quick grades"
      title={
        <span className="flex items-center gap-2">
          {cycleTitle(state.cycleNumber)}
          {state.loading ? <Spinner label="Loading grades" /> : null}
        </span>
      }
      description={projectName}
      width="lg"
      footer={showFooter(state, peopleCount) ? <QuickGradesFooter state={state} className="h-auto!" /> : undefined}
    >
      <QuickGradesBody state={state} peopleCount={peopleCount} />
    </Sheet>
  );
}
