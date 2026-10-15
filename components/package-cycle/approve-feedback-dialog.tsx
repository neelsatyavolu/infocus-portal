"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { isSubmitShortcut, SubmitShortcutHint } from "@/components/ui/submit-shortcut";
import { Textarea } from "@/components/ui/textarea";

/** "Any feedback to add?" before an approval: Skip approves with no note, Add feedback sends one. */
export function ApproveFeedbackDialog({
  open,
  saving,
  onOpenChange,
  onConfirm
}: {
  open: boolean;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (feedback: string) => void;
}) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open) setDraft("");
  }, [open]);

  const feedback = draft.trim();

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Any feedback to add?</DialogTitle>
          <DialogDescription>Optional note for the group. Skip if you have nothing to add.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (!isSubmitShortcut(event)) return;
              event.preventDefault();
              if (!saving && feedback) onConfirm(feedback);
            }}
            rows={4}
            maxLength={2000}
            disabled={saving}
            aria-label="Feedback for this group"
            placeholder="Write feedback for this group…"
            className="resize-y"
          />
          <SubmitShortcutHint action="add feedback" />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onConfirm("")}>
            Skip
          </Button>
          <Button type="button" disabled={saving || !feedback} onClick={() => onConfirm(feedback)}>
            {saving ? <Spinner /> : null}
            Add feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
