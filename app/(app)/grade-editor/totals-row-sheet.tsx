"use client";

import type { ReactNode } from "react";
import { UserRound } from "lucide-react";
import { SectionLabel } from "@/components/kit/section";
import { Sheet } from "@/components/kit/sheet";
import { SaveState, StatusTag, type SaveStateValue } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import type { TotalsAdjustments } from "@/src/lib/grade-editor-csv";
import { MAX_NOTES_LENGTH, PARTICIPATION_HINT } from "./grade-editor-types";
import { emailLocalPart, letterGrade, personLabel } from "./grade-editor-utils";
import { LetterGradeTag, PercentReadout, PointsReadout } from "./grade-editor-table";
import { LimitedTextarea, TextCounter } from "./limited-textarea";
import { SheetStepButtons } from "./sheet-step-buttons";
import { CheckInsTotalField, CycleTotalField, ExtraField, FinalField, LivestreamField } from "./totals-fields";
import type { TotalsRowView } from "./totals-grades-table";

function Line({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-4" title={title}>
      <span className="text-sm text-[var(--ink-text)]">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </div>
  );
}

/** Phones and tablets: one reporter's total grade, the temporary credits and notes, in a bottom sheet. */
export function TotalsRowSheet({
  view,
  notesState,
  onUpdateAdjustment,
  onUpdateNotes,
  onClose,
  onPrevious,
  onNext,
  onOpenGradebook
}: {
  view: TotalsRowView;
  notesState: SaveStateValue;
  onUpdateAdjustment: (userId: string, patch: Partial<TotalsAdjustments>) => void;
  onUpdateNotes: (userId: string, notes: string) => void;
  onClose: () => void;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  /** Opens this reporter in the Student view (the name in the desktop table does the same). */
  onOpenGradebook: () => void;
}) {
  const { row, adjustments, summary, edited } = view;
  const update = (patch: Partial<TotalsAdjustments>) => onUpdateAdjustment(row.userId, patch);
  const letter = summary.totalPct === null ? null : letterGrade(summary.totalPct);

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      side="bottom"
      title={personLabel(row)}
      description={`Total grade · ${emailLocalPart(row.email)}`}
      headerExtra={
        <>
          <LetterGradeTag percent={summary.totalPct} letter={letter} />
          <PercentReadout percent={summary.totalPct} />
          {edited ? (
            <StatusTag tone="warning" title="Temporary: changes this page and the CSV only, gone after a reload">
              Edited
            </StatusTag>
          ) : null}
        </>
      }
      footer={<SheetStepButtons onPrevious={onPrevious} onNext={onNext} />}
    >
      <div className="space-y-6">
        <section className="space-y-1">
          <SectionLabel as="h3" rule end="/50 each">
            Packages
          </SectionLabel>
          {row.cycleTotals.map((entry) => (
            <Line key={entry.cycleNumber} label={`Cycle ${entry.cycleNumber}`}>
              <CycleTotalField row={row} entry={entry} adjustments={adjustments} update={update} size="touch" />
            </Line>
          ))}
          <Line label="Subtotal">
            <PointsReadout
              earned={summary.packages.possible > 0 ? summary.packages.earned : null}
              possible={summary.packages.possible > 0 ? summary.packages.possible : null}
            />
          </Line>
        </section>

        <section className="space-y-1">
          <SectionLabel as="h3" rule end="Temporary">
            Semester credits
          </SectionLabel>
          <Line label="Check-ins">
            <CheckInsTotalField row={row} adjustments={adjustments} checkInMax={summary.checkInMax} update={update} size="touch" />
          </Line>
          <Line label="Livestream (out of 40)">
            <LivestreamField row={row} adjustments={adjustments} update={update} size="touch" />
          </Line>
          <Line label="Participation" title={PARTICIPATION_HINT}>
            <PointsReadout earned={row.participationEarned} possible={row.participationPossible} />
          </Line>
          <Line label="Final (out of 100)">
            <FinalField row={row} adjustments={adjustments} update={update} size="touch" />
          </Line>
          <Line label="Extra (earned / possible)">
            <ExtraField row={row} adjustments={adjustments} update={update} size="touch" />
          </Line>
        </section>

        <section className="space-y-2">
          <SectionLabel
            as="h3"
            rule
            end={
              <>
                <SaveState state={notesState} idleLabel="Saves automatically" errorLabel="Not saved" />
                <TextCounter id="sheet-notes-count" length={adjustments.notes.length} max={MAX_NOTES_LENGTH} />
              </>
            }
          >
            Notes
          </SectionLabel>
          <LimitedTextarea
            value={adjustments.notes}
            onChange={(notes) => onUpdateNotes(row.userId, notes)}
            maxLength={MAX_NOTES_LENGTH}
            placeholder="Notes for this reporter's total grade..."
            label={`Notes for ${personLabel(row)}`}
            describedBy="sheet-notes-count"
            rows={5}
          />
        </section>

        <Button type="button" variant="ghost" size="lg" className="px-3" onClick={onOpenGradebook}>
          <UserRound aria-hidden />
          Open gradebook
        </Button>
      </div>
    </Sheet>
  );
}
