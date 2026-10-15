"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { focusRowMenu } from "./queue-package-row";
import type { QueueRow } from "./queue-types";

export type PublishTarget = { row: QueueRow; returnFocusId?: string };

/**
 * "Publish to YouTube now?" Publish now closes it at once and the row shows its spinner while
 * the upload starts. Focus goes back to the row's ⋯ trigger.
 */
export function PublishConfirmDialog({
  open,
  target,
  onClose,
  onConfirm
}: {
  open: boolean;
  target: PublishTarget | null;
  onClose: () => void;
  onConfirm: (row: QueueRow) => void;
}) {
  const row = target?.row;
  return (
    <Dialog open={open && target !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-w-md"
        onCloseAutoFocus={(event) => {
          if (focusRowMenu(target?.returnFocusId)) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Publish to YouTube now?</DialogTitle>
          <DialogDescription>
            {`“${row?.headline || row?.groupTopic || "This package"}” uploads now as unlisted instead of on its air date. Website managers get the embed code once YouTube finishes processing.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (row) onConfirm(row);
              onClose();
            }}
          >
            Publish now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
