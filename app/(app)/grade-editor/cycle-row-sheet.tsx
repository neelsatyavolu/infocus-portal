"use client";

import type { ReactNode } from "react";
import { History, UserRound } from "lucide-react";
import { cycleCheckInSummary } from "@/src/lib/grade-editor-summary";
import { CHECK_IN_STAGES } from "@/src/lib/package-stages";
import { SectionLabel } from "@/components/kit/section";
import { Sheet } from "@/components/kit/sheet";
import { SaveState, type SaveStateValue } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import {
  CHECK_IN_LABELS,
  FINAL_CUT_REQUIRED_HINT,
  LATE_POLICY_HINT,
  MAX_FEEDBACK_LENGTH,
  PARTICIPATION_HINT,
  type GradeRow,
  type TotalsRow
} from "./grade-editor-types";
import { emailLocalPart, rowLabel } from "./grade-editor-utils";
import { PointsReadout } from "./grade-editor-table";
import { LimitedTextarea, TextCounter } from "./limited-textarea";
import { SheetStepButtons } from "./sheet-step-buttons";
import type { CycleRowHandlers, CycleRowState } from "./cycle-grades-table";
import {
  CheckInField,
  OverExtensionsTag,
  PublishButton,
  RowSaveMark,
  RowStatusTag,
  ScoreField,
  ScorePercent,
  TurnedInField
} from "./row-fields";

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <span className="text-sm text-[var(--ink-text)]">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
      {hint ? <p className="w-full text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Phones and tablets: everything for one reporter in one cycle, in a bottom sheet. Same handlers as the
 * desktop row (autosave, check-in save, publish); Previous / Next walk the filtered order.
 */
export function CycleRowSheet({
  row,
  cycleNumber,
  state,
  handlers,
  participation,
  feedbackState,
  onClose,
  onPrevious,
  onNext,
  onOpenGradebook
}: {
  row: GradeRow;
  cycleNumber: number;
  state: CycleRowState;
  handlers: CycleRowHandlers;
  participation: TotalsRow | null;
  feedbackState: SaveStateValue;
  onClose: () => void;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  onOpenGradebook: () => void;
}) {
  const dirty = state.dirtyUserIds.has(row.userId);
  const checkIns = cycleCheckInSummary(row.checkInScores);
  const checkInsCounted = checkIns.possible > 0;

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      side="bottom"
      title={rowLabel(row)}
      description={`Cycle ${cycleNumber} · ${emailLocalPart(row.email)}`}
      headerExtra={
        <>
          <RowStatusTag row={row} size="md" />
          <OverExtensionsTag row={row} size="md" />
          <RowSaveMark saving={state.savingUserId === row.userId} dirty={dirty} failed={state.failedUserId === row.userId} size="md" />
        </>
      }
      footer={<SheetStepButtons onPrevious={onPrevious} onNext={onNext} />}
    >
      <div className="space-y-6">
        <section className="space-y-1">
          <SectionLabel as="h3" rule>
            Final cut
          </SectionLabel>
          <Field label="Score (out of 50)" hint={`Type points, - for ungraded, or \\ for exempt. ${LATE_POLICY_HINT}`}>
            <ScorePercent row={row} />
            <ScoreField row={row} size="touch" onChange={(patch) => handlers.onUpdateRow(row.userId, patch)} />
          </Field>
          <Field label="Turned in" hint={state.locked ? `${FINAL_CUT_REQUIRED_HINT}.` : undefined}>
            <span className="w-40">
              <TurnedInField
                row={row}
                locked={state.locked}
                size="touch"
                onChange={(turnedInDate) => handlers.onUpdateRow(row.userId, { turnedInDate })}
              />
            </span>
          </Field>
        </section>

        <section className="space-y-2">
          <SectionLabel
            as="h3"
            rule
            end={
              <PointsReadout
                earned={checkInsCounted ? checkIns.earned : null}
                possible={checkInsCounted ? checkIns.possible : null}
              />
            }
          >
            Check-ins
          </SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            {CHECK_IN_STAGES.map((stage) => (
              <div key={stage} className="space-y-1">
                <span className="block text-xs text-muted-foreground">{CHECK_IN_LABELS[stage]}</span>
                <CheckInField
                  row={row}
                  stage={stage}
                  size="touch"
                  disabled={state.savingCheckIn}
                  onChange={(value) => handlers.onSaveCheckIn(row.userId, stage, value)}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-1">
          <SectionLabel as="h3" rule>
            Semester
          </SectionLabel>
          <Field label="Participation">
            {participation ? (
              <PointsReadout
                earned={participation.participationEarned}
                possible={participation.participationPossible}
                title={PARTICIPATION_HINT}
              />
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </Field>
        </section>

        <section className="space-y-2">
          <SectionLabel
            as="h3"
            rule
            end={
              <>
                <SaveState state={feedbackState} errorLabel="Not saved" />
                <TextCounter id="sheet-feedback-count" length={row.feedback.length} max={MAX_FEEDBACK_LENGTH} />
              </>
            }
          >
            Feedback
          </SectionLabel>
          <LimitedTextarea
            value={row.feedback}
            onChange={(feedback) => handlers.onUpdateRow(row.userId, { feedback })}
            maxLength={MAX_FEEDBACK_LENGTH}
            placeholder="Feedback for this user in this cycle..."
            label={`Feedback for ${rowLabel(row)}`}
            describedBy="sheet-feedback-count"
            rows={5}
          />
        </section>

        <section className="space-y-3">
          <SectionLabel as="h3" rule>
            Publishing
          </SectionLabel>
          <PublishButton
            row={row}
            size="touch"
            publishing={state.publishingUserId === row.userId}
            disabled={state.savingAll || state.publishingAll || state.savingUserId === row.userId}
            onClick={() => handlers.onTogglePublish(row.userId)}
          />
          <div className="flex flex-wrap gap-2">
            {row.publicationHistory.length > 0 ? (
              <Button type="button" variant="ghost" size="lg" className="px-3" onClick={() => handlers.onOpenHistory(row.userId)}>
                <History aria-hidden />
                Publish history
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="lg" className="px-3" onClick={onOpenGradebook}>
              <UserRound aria-hidden />
              Open gradebook
            </Button>
          </div>
        </section>
      </div>
    </Sheet>
  );
}
