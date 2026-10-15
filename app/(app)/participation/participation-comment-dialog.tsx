"use client";

import { AutoGrowTextarea } from "@/components/people/auto-grow-textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { NOTE_MAX, WEEKDAY_LABELS, formatShortDate } from "./participation-week";

/**
 * The comment for one cell. It edits the week's drafts only; Save in the action bar keeps it
 * (and only with a score). Done, Esc, the X or a click outside all close it.
 */
export function ParticipationCommentDialog({
  open,
  studentName,
  day,
  points,
  max,
  note,
  onChange,
  onClose
}: {
  open: boolean;
  studentName: string;
  /** The cell's day, when it is in the shown week. */
  day: Date | null;
  points: number | undefined;
  max: number;
  note: string;
  onChange: (note: string) => void;
  onClose: () => void;
}) {
  const helper =
    points === undefined
      ? "Enter a score for this day, then Save. A comment only saves with a score."
      : points < max
        ? "Docked scores need another producer to approve before students see this."
        : "Full marks post immediately. Save the week to keep this comment.";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Participation comment</DialogTitle>
          {day ? (
            <DialogDescription>
              {studentName} · {WEEKDAY_LABELS[day.getDay()]} {formatShortDate(day)}
              {points !== undefined ? ` · ${points}/${max}` : ""}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {open ? (
          <div className="min-w-0 space-y-2">
            <AutoGrowTextarea
              value={note}
              onChange={(event) => onChange(event.target.value)}
              rows={5}
              maxLength={NOTE_MAX}
              placeholder="Why points were docked…"
              aria-label={`Comment for ${studentName}`}
              aria-describedby="participation-comment-help"
              className="min-h-32 max-h-[50dvh]"
              autoFocus
            />
            <div className="flex items-start justify-between gap-4 text-xs text-muted-foreground">
              <p id="participation-comment-help" className="min-w-0">
                {helper}
              </p>
              <span className="shrink-0 font-mono-broadcast tabular-nums">
                {note.length} / {NOTE_MAX}
              </span>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
