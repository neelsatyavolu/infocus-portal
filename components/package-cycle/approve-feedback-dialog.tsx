"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Any feedback to add?</DialogTitle>
          <DialogDescription>
            Optional note for the group. Skip if you have nothing to add.
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          maxLength={2000}
          disabled={saving}
          placeholder="Write feedback for this group…"
          className="w-full resize-y rounded-lg border border-border bg-black/40 light:bg-muted px-3 py-2 text-sm text-foreground outline-none focus:border-[var(--brand-green)]/50"
        />
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={() => onConfirm("")}
          >
            Skip
          </Button>
          <Button type="button" disabled={saving || !feedback} onClick={() => onConfirm(feedback)}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Add feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
