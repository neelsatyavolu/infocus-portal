"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { Alert, InlineNote } from "@/components/kit/alert";
import { ListRow } from "@/components/kit/list-row";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { MAX_PACKAGES_PER_SHOW, QUEUE_SHOW_FULL_MESSAGE, canManuallyPlaceOnShow } from "@/src/lib/publishing-queue";
import { formatShowDateLabel } from "@/src/lib/show-assignment";
import { focusRowMenu } from "./queue-package-row";
import type { OccupiedOn, QueueRow, ShowOption } from "./queue-types";
import { buildMoveOptions, queueRowTitle, youtubeStatusView } from "./queue-view-model";

export type MoveTarget = {
  row: QueueRow;
  options: ShowOption[];
  /** The row's element id: focus goes back to its ⋯ trigger on close. */
  returnFocusId?: string;
};

/**
 * Move to another show: the keyboard and touch path for what producers do by dragging. Full
 * shows are disabled; the current show is marked. Same guard and call as a drop. The target
 * stays set while the dialog animates closed, so its words don't blank out.
 */
export function MoveToShowDialog({
  open,
  target,
  occupiedOn,
  onMove,
  onClose
}: {
  open: boolean;
  target: MoveTarget | null;
  occupiedOn: OccupiedOn;
  onMove: (rowId: string, showDate: string) => void;
  onClose: () => void;
}) {
  const row = target?.row ?? null;
  const options = useMemo(
    () => (target ? buildMoveOptions(target.row, target.options, occupiedOn) : []),
    [target, occupiedOn]
  );
  const status = youtubeStatusView(row?.youtubePublication?.status).key;
  const title = row ? queueRowTitle(row) : "";
  const where = row?.queuedForShowDate
    ? `is on ${formatShowDateLabel(row.queuedForShowDate)}`
    : "has no show yet";

  function pick(date: string) {
    if (!row || date === row.queuedForShowDate) return;
    if (!canManuallyPlaceOnShow(occupiedOn(date, row.id))) {
      toast.error(QUEUE_SHOW_FULL_MESSAGE);
      return;
    }
    onMove(row.id, date);
    onClose();
  }

  return (
    <Dialog open={open && target !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-h-[85dvh] max-w-md"
        onCloseAutoFocus={(event) => {
          if (focusRowMenu(target?.returnFocusId)) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Move to another show</DialogTitle>
          <DialogDescription>
            {`“${title}” ${where}. Up to ${MAX_PACKAGES_PER_SHOW} packages per show.`}
          </DialogDescription>
        </DialogHeader>
        {status === "uploading" || status === "processing" ? (
          <Alert tone="warning" compact>
            This package is uploading to YouTube. Changing its air date needs an operator to reconcile the upload.
          </Alert>
        ) : null}
        {status === "published" ? <InlineNote>Moving it won&apos;t upload it again.</InlineNote> : null}
        <div className="min-w-0 overflow-hidden rounded-md border border-border">
          <ul aria-label="Shows" className="divide-y divide-border">
            {row && !row.queuedForShowDate ? (
              <ListRow
                title="Next empty show"
                tags={<StatusTag size="sm" tone="success">Current</StatusTag>}
              />
            ) : null}
            {options.map((option) => (
              <ListRow
                key={option.date}
                title={option.dateLabel}
                subtitle={option.specialName ?? undefined}
                tags={
                  option.current ? (
                    <StatusTag size="sm" tone="success">Current</StatusTag>
                  ) : option.full ? (
                    <StatusTag size="sm">Full</StatusTag>
                  ) : undefined
                }
                meta={
                  option.full ? undefined : (
                    <span className="font-mono-broadcast tabular-nums">
                      {option.count}/{MAX_PACKAGES_PER_SHOW}
                    </span>
                  )
                }
                disabled={option.full}
                onClick={option.current || option.full ? undefined : () => pick(option.date)}
              />
            ))}
          </ul>
        </div>
        {/* Sticky: 13+ shows scroll the dialog on phones, and Cancel stays in reach. */}
        <DialogFooter sticky>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
