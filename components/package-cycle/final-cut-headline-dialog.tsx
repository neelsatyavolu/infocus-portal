"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HEADLINE_MAX_LENGTH, headlineError } from "@/src/lib/package-headline";
import { TOSS_EXAMPLE, TOSS_MAX_LENGTH, tossError } from "@/src/lib/package-toss";

/**
 * Upload mode asks for the headline and toss before the file picker (or before uploading a dropped video).
 * Toss mode edits only the toss on a Final Cut that is already uploaded.
 */
export function FinalCutHeadlineDialog({
  open,
  mode = "upload",
  initialHeadline,
  initialToss,
  saving = false,
  hasVideo = false,
  onOpenChange,
  onContinue
}: {
  open: boolean;
  mode?: "upload" | "toss";
  initialHeadline: string;
  initialToss: string;
  saving?: boolean;
  /** A video was already dropped, so continuing uploads it instead of opening the file picker. */
  hasVideo?: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: (input: { headline: string; toss: string }) => void;
}) {
  const [headline, setHeadline] = useState("");
  const [toss, setToss] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const askHeadline = mode === "upload";

  useEffect(() => {
    if (open) {
      setHeadline(initialHeadline);
      setToss(initialToss);
      setSubmitted(false);
    }
  }, [open, initialHeadline, initialToss]);

  const headlineProblem = askHeadline ? headlineError(headline) : null;
  const tossProblem = tossError(toss);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{askHeadline ? "Headline and toss" : "Toss for the anchors"}</DialogTitle>
          <DialogDescription>
            {askHeadline
              ? "The headline becomes the package title in the Publishing Queue and on YouTube. The toss is what an anchor reads right before your package airs."
              : "What an anchor reads right before your package airs. It fills in the show's teleprompter script."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            if (!headlineProblem && !tossProblem) onContinue({ headline: headline.trim(), toss: toss.trim() });
          }}
        >
          {askHeadline ? (
            <div className="space-y-1.5">
              <label htmlFor="final-cut-headline" className="text-sm font-medium text-foreground">
                Headline
              </label>
              <Input
                id="final-cut-headline"
                value={headline}
                onChange={(event) => setHeadline(event.target.value)}
                maxLength={HEADLINE_MAX_LENGTH}
                placeholder="Palo Alto Airport Day brings the community together"
                aria-invalid={submitted && Boolean(headlineProblem)}
                autoFocus
              />
              <div className="flex justify-between gap-3 text-xs">
                <span className="text-danger">{submitted ? headlineProblem : null}</span>
                <span className="tabular-nums text-muted-foreground">
                  {headline.trim().length}/{HEADLINE_MAX_LENGTH}
                </span>
              </div>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <label htmlFor="final-cut-toss" className="text-sm font-medium text-foreground">
              Toss
            </label>
            <Textarea
              id="final-cut-toss"
              value={toss}
              onChange={(event) => setToss(event.target.value)}
              maxLength={TOSS_MAX_LENGTH}
              rows={4}
              placeholder={TOSS_EXAMPLE}
              aria-invalid={submitted && Boolean(tossProblem)}
              autoFocus={!askHeadline}
            />
            <p className="text-xs text-muted-foreground">
              One or two sentences that set up the story and name the reporters.
            </p>
            <div className="flex justify-between gap-3 text-xs">
              <span className="text-danger">{submitted ? tossProblem : null}</span>
              <span className="tabular-nums text-muted-foreground">
                {toss.trim().length}/{TOSS_MAX_LENGTH}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {askHeadline ? (hasVideo ? "Upload" : "Choose video") : saving ? "Saving…" : "Save toss"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
