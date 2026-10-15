"use client";

import { useState } from "react";
import { InlineError } from "@/components/kit/alert";
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
  const [headline, setHeadline] = useState(() => (open ? initialHeadline : ""));
  const [toss, setToss] = useState(() => (open ? initialToss : ""));
  const [submitted, setSubmitted] = useState(false);
  const [prevInputs, setPrevInputs] = useState({ open, initialHeadline, initialToss });
  const askHeadline = mode === "upload";

  if (
    open !== prevInputs.open ||
    initialHeadline !== prevInputs.initialHeadline ||
    initialToss !== prevInputs.initialToss
  ) {
    setPrevInputs({ open, initialHeadline, initialToss });
    if (open) {
      setHeadline(initialHeadline);
      setToss(initialToss);
      setSubmitted(false);
    }
  }

  const headlineProblem = askHeadline ? headlineError(headline) : null;
  const tossProblem = tossError(toss);
  const showHeadlineError = submitted && Boolean(headlineProblem);
  const showTossError = submitted && Boolean(tossProblem);

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
                aria-invalid={showHeadlineError}
                aria-describedby={showHeadlineError ? "final-cut-headline-error" : undefined}
                autoFocus
              />
              <div className="flex items-start justify-between gap-3 text-xs">
                {showHeadlineError ? (
                  <InlineError id="final-cut-headline-error">{headlineProblem}</InlineError>
                ) : (
                  <span />
                )}
                <span className="shrink-0 tabular-nums text-muted-foreground">
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
              aria-invalid={showTossError}
              aria-describedby={showTossError ? "final-cut-toss-hint final-cut-toss-error" : "final-cut-toss-hint"}
              autoFocus={!askHeadline}
            />
            <p id="final-cut-toss-hint" className="text-xs text-muted-foreground">
              One or two sentences that set up the story and name the reporters.
            </p>
            <div className="flex items-start justify-between gap-3 text-xs">
              {showTossError ? <InlineError id="final-cut-toss-error">{tossProblem}</InlineError> : <span />}
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {toss.trim().length}/{TOSS_MAX_LENGTH}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
