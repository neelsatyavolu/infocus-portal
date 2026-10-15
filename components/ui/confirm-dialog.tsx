"use client";

import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { InlineError } from "@/components/kit/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

/**
 * "Are you sure?" step. For destructive actions the confirm button is the only solid Danger
 * fill (DESIGN.md §10); `tone="default"` is for confirmations that aren't destructive.
 * If `onConfirm` throws, the dialog stays open so the caller's error can be read and retried.
 * `children` shows extra content (a preview of what will be deleted); `error` shows the failure
 * inside the dialog.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Keep it",
  tone = "destructive",
  busyLabel,
  error,
  children,
  onConfirm
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "destructive" | "default";
  /** Confirm label while it runs ("Deleting…"). */
  busyLabel?: string;
  /** Error from the last attempt, shown above the buttons. */
  error?: string | null;
  children?: ReactNode;
  onConfirm: () => Promise<unknown> | void;
}) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The caller already showed the error; keep the dialog open so they can retry.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent onOpenAutoFocus={pointerSafeAutoFocus} className="outline-none max-w-md [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children ? <div className="min-w-0">{children}</div> : null}
        {error ? <InlineError>{error}</InlineError> : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "destructive" ? "destructive" : "default"}
            onClick={() => void confirm()}
            disabled={busy}
          >
            {busy ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : null}
            {busy && busyLabel ? busyLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
