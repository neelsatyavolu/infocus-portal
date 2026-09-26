"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { HEADLINE_MAX_LENGTH, headlineError } from "@/src/lib/package-headline";

export function FinalCutHeadlineDialog({
  open,
  initialHeadline,
  onOpenChange,
  onContinue
}: {
  open: boolean;
  initialHeadline: string;
  onOpenChange: (open: boolean) => void;
  onContinue: (headline: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(initialHeadline);
      setSubmitted(false);
    }
  }, [open, initialHeadline]);

  const error = headlineError(draft);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Headline for your package</DialogTitle>
          <DialogDescription>
            One line that sums up the story. It becomes the package title in the Publishing Queue and on YouTube.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            if (!error) onContinue(draft.trim());
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={HEADLINE_MAX_LENGTH}
            placeholder="Palo Alto Airport Day brings the community together"
            aria-label="Headline"
            aria-invalid={submitted && Boolean(error)}
            autoFocus
          />
          <div className="flex justify-between gap-3 text-xs">
            <span className="text-danger">{submitted ? error : null}</span>
            <span className="tabular-nums text-muted-foreground">
              {draft.trim().length}/{HEADLINE_MAX_LENGTH}
            </span>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Choose video</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
