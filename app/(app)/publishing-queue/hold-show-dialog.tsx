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
import { Input } from "@/components/ui/input";
import { QUEUE_HOLD_LABEL_MAX } from "@/src/lib/publishing-queue";

export type HoldTarget = { date: string; dateLabel: string };

const DEFAULT_NAME = "Recap";

/**
 * Hold a show day for a show that has no file yet (a recap, say). The name goes on the calendar,
 * so the day is a special show: auto-assign skips it, and the file can be dragged here later.
 * The target stays set while the dialog animates closed, so its words don't blank out.
 */
export function HoldShowDialog({
  open,
  target,
  onHold,
  onClose
}: {
  open: boolean;
  target: HoldTarget | null;
  onHold: (date: string, label: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(DEFAULT_NAME);
  const [wasOpen, setWasOpen] = useState(open);
  // Each opening starts from the default name (state adjusted during render, not in an effect).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setName(DEFAULT_NAME);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const label = name.trim();
    if (!target || !label) return;
    onHold(target.date, label);
    onClose();
  }

  return (
    <Dialog open={open && target !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Hold {target?.dateLabel ?? "this show"}</DialogTitle>
            <DialogDescription>
              Auto-assign skips a held show, and it shows on the master calendar under this name. Drag the
              package onto it once you have the file. Packages already on it stay.
            </DialogDescription>
          </DialogHeader>
          <Field label="Show name" htmlFor="hold-show-name">
            <Input
              id="hold-show-name"
              required
              autoFocus
              maxLength={QUEUE_HOLD_LABEL_MAX}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Hold show
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
