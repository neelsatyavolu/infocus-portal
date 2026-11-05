"use client";

import { Alert } from "@/components/kit/alert";
import { KeyValueList } from "@/components/kit/key-value";
import { SaveState, StatusTag, type SaveStateValue } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { MAX_FEEDBACK_LENGTH, MAX_NOTES_LENGTH, type GradeRow, type TotalsRow } from "./grade-editor-types";
import {
  extensionExceptionSummary,
  formatHistoryTimestamp,
  formatLongDate,
  historyEventLabel,
  personLabel,
  rowLabel
} from "./grade-editor-utils";
import { LimitedTextarea, TextCounter } from "./limited-textarea";

/** Dialogs of the Grade Editor. Loaded on demand (next/dynamic) the first time one opens. */

function closeOnDismiss(onClose: () => void) {
  return (isOpen: boolean) => {
    if (!isOpen) onClose();
  };
}

export function FeedbackDialog({
  row,
  cycleNumber,
  saveState,
  onChange,
  onClose
}: {
  row: GradeRow;
  cycleNumber: number;
  saveState: SaveStateValue;
  onChange: (feedback: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={closeOnDismiss(onClose)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit feedback</DialogTitle>
          <DialogDescription>{`${rowLabel(row)} · Cycle ${cycleNumber}`}</DialogDescription>
        </DialogHeader>
        <LimitedTextarea
          value={row.feedback}
          onChange={onChange}
          maxLength={MAX_FEEDBACK_LENGTH}
          placeholder="Feedback for this user in this cycle..."
          label={`Feedback for ${rowLabel(row)}`}
          describedBy="grade-feedback-count"
          autoFocus
        />
        <DialogFooter className="items-center sm:justify-between">
          <span className="flex items-center gap-3">
            <SaveState state={saveState} errorLabel="Not saved" />
            <TextCounter id="grade-feedback-count" length={row.feedback.length} max={MAX_FEEDBACK_LENGTH} />
          </span>
          <Button type="button" variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PublishHistoryDialog({
  row,
  cycleNumber,
  onClose
}: {
  row: GradeRow;
  cycleNumber: number;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={closeOnDismiss(onClose)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Publish history</DialogTitle>
          <DialogDescription>{`${rowLabel(row)} · Cycle ${cycleNumber}`}</DialogDescription>
        </DialogHeader>
        {row.publicationHistory.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {row.publicationHistory.map((event, index) => (
              <li key={`${event.eventType}-${event.occurredAt ?? index}`} className="flex min-h-10 items-center justify-between gap-3 px-3 py-2">
                <StatusTag tone={event.eventType === "PUBLISHED" ? "success" : "warning"}>
                  {historyEventLabel(event.eventType)}
                </StatusTag>
                <span className="font-mono-broadcast text-xs tabular-nums text-[var(--ink-text)]">
                  {formatHistoryTimestamp(event.occurredAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No publish history recorded yet.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Extension days for one row. Nothing opens this today (it was unreachable before the redesign
 * too); kept so it can be wired from the row once that is approved.
 */
export function ExtensionExceptionDialog({
  row,
  cycleNumber,
  finalCutDate,
  onClose
}: {
  row: GradeRow;
  cycleNumber: number;
  finalCutDate: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={closeOnDismiss(onClose)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Extension exception</DialogTitle>
          <DialogDescription>{`${rowLabel(row)} · Cycle ${cycleNumber}`}</DialogDescription>
        </DialogHeader>
        <Alert tone="warning" compact>
          {extensionExceptionSummary(row) ?? "No free extension-day exception is applied."}
        </Alert>
        <KeyValueList
          columns={2}
          labelWidth="7rem"
          items={[
            { label: "Final Cut", value: formatLongDate(finalCutDate) },
            { label: "Turned in", value: formatLongDate(row.turnedInDate) },
            { label: "Late days", value: row.extensionDetails.calculatedDays, mono: true },
            { label: "Free days", value: row.extensionDetails.freeDays, mono: true },
            { label: "Charged days", value: row.extensionDetails.chargedDays, mono: true },
            { label: "Exempt", value: row.extensionDetails.exempt ? "Yes" : "No" }
          ]}
        />
      </DialogContent>
    </Dialog>
  );
}

export function TotalNotesDialog({
  row,
  notes,
  saveState,
  onChange,
  onClose
}: {
  row: TotalsRow;
  notes: string;
  saveState: SaveStateValue;
  onChange: (notes: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={closeOnDismiss(onClose)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Total grade notes</DialogTitle>
          <DialogDescription>{personLabel(row)}</DialogDescription>
        </DialogHeader>
        <LimitedTextarea
          value={notes}
          onChange={onChange}
          maxLength={MAX_NOTES_LENGTH}
          placeholder="Notes for this reporter's total grade..."
          label={`Notes for ${personLabel(row)}`}
          describedBy="grade-notes-count"
          autoFocus
        />
        <DialogFooter className="items-center sm:justify-between">
          <span className="flex items-center gap-3">
            <SaveState state={saveState} idleLabel="Saves automatically" errorLabel="Not saved" />
            <TextCounter id="grade-notes-count" length={notes.length} max={MAX_NOTES_LENGTH} />
          </span>
          <Button type="button" variant="outline" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExtensionDepletedDialog({
  warning,
  onClose
}: {
  warning: { userName: string; remaining: number };
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={closeOnDismiss(onClose)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>No extensions remaining</DialogTitle>
        </DialogHeader>
        <Alert tone="danger" title={warning.userName}>
          This student has exhausted their extension days ({warning.remaining} remaining). The updated turn-in date caused
          their available extensions to be fully used.
        </Alert>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
