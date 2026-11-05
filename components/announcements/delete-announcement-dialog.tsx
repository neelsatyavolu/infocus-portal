"use client";

import type { SubmittedAnnouncement } from "@/components/submitted-announcement-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * "Delete announcement?" with a scrollable preview of the text. It can't be dismissed while the
 * delete runs; `onConfirm` throws on failure so the dialog stays open with `error` shown.
 */
export function DeleteAnnouncementDialog({
  entry,
  error,
  onClose,
  onConfirm
}: {
  entry: SubmittedAnnouncement | null;
  error: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <ConfirmDialog
      open={Boolean(entry)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Delete announcement?"
      description="This announcement will be removed from submissions and future scripts. This cannot be undone."
      confirmLabel="Delete announcement"
      cancelLabel="Cancel"
      busyLabel="Deleting…"
      error={error}
      onConfirm={onConfirm}
    >
      <p className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 text-sm">
        {entry?.announcement}
      </p>
    </ConfirmDialog>
  );
}
