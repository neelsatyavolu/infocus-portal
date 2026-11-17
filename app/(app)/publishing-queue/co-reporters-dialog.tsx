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
import { focusRowMenu } from "./queue-package-row";
import type { QueueRow } from "./queue-types";
import { queueRowTitle } from "./queue-view-model";

export type CoReportersTarget = { row: QueueRow; returnFocusId?: string };

/**
 * Website co-reporters: people who worked on a package but aren't on its Package Cycle roster.
 * They go on its infocusnews.tv byline only. Save closes the dialog once the names are saved.
 */
export function CoReportersDialog({
  open,
  target,
  onSave,
  onClose
}: {
  open: boolean;
  target: CoReportersTarget | null;
  onSave: (rowId: string, names: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [names, setNames] = useState("");
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  // Each opening starts from the saved names (state adjusted during render, not in an effect).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setNames(target?.row.extraWriters?.join(", ") ?? "");
  }

  const row = target?.row;
  const members = row?.members.filter(Boolean).join(", ");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!row || saving) return;
    setSaving(true);
    const saved = await onSave(row.id, names);
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
            <DialogTitle>Website co-reporters</DialogTitle>
            <DialogDescription>
              {`Credited on the infocusnews.tv story for “${row ? queueRowTitle(row) : ""}”, after ${
                members ? members : "the package members"
              }. They aren't added to the package roster. A story that's already posted keeps its byline.`}
            </DialogDescription>
          </DialogHeader>
          <Field label="Names" htmlFor="co-reporter-names" hint="Full names, separated by commas.">
            <Input
              id="co-reporter-names"
              autoFocus
              autoComplete="off"
              aria-describedby="co-reporter-names-hint"
              placeholder="Abby Lane, Otto Reyes"
              value={names}
              onChange={(event) => setNames(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
