"use client";

import { type FormEvent, useState } from "react";
import { Field } from "@/components/kit/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { TOSS_EXAMPLE, TOSS_MAX_LENGTH, tossError } from "@/src/lib/package-toss";
import { focusRowMenu } from "./queue-package-row";
import type { QueueRow } from "./queue-types";
import { queueRowTitle } from "./queue-view-model";

export type TossTarget = { row: QueueRow; returnFocusId?: string };

/**
 * Toss for a custom (uploaded) package, which has no Final Cut tab. It goes on the show's
 * teleprompter and becomes the YouTube description. Blank clears it.
 */
export function TossDialog({
  open,
  target,
  onSave,
  onClose
}: {
  open: boolean;
  target: TossTarget | null;
  onSave: (rowId: string, toss: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [toss, setToss] = useState("");
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  // Each opening starts from the saved toss (state adjusted during render, not in an effect).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setToss(target?.row.toss ?? "");
  }

  const row = target?.row;
  const problem = toss.trim() ? tossError(toss) : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!row || saving || problem) return;
    setSaving(true);
    const saved = await onSave(row.id, toss);
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <Dialog open={open && target !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-w-md"
        onCloseAutoFocus={(event) => {
          if (focusRowMenu(target?.returnFocusId)) event.preventDefault();
        }}
      >
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Toss</DialogTitle>
            <DialogDescription>
              {`What the anchors read before “${row ? queueRowTitle(row) : ""}”. It goes on the show's teleprompter and becomes the YouTube description when the upload starts.`}
            </DialogDescription>
          </DialogHeader>
          <Field
            label="Toss"
            htmlFor="custom-package-toss"
            hint={`${toss.trim().length}/${TOSS_MAX_LENGTH} characters. Leave it blank to clear it.`}
            error={problem}
          >
            <Textarea
              id="custom-package-toss"
              autoFocus
              rows={5}
              aria-invalid={problem ? true : undefined}
              aria-describedby="custom-package-toss-hint"
              placeholder={TOSS_EXAMPLE}
              value={toss}
              onChange={(event) => setToss(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || Boolean(problem)}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
