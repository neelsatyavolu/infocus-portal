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
import { CUSTOM_PACKAGE_TITLE_MAX_LENGTH } from "@/src/lib/publishing-queue";
import { focusRowMenu } from "./queue-package-row";
import type { QueueRow } from "./queue-types";

export type TitleTarget = { row: QueueRow; returnFocusId?: string };

function titleError(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return "Add a title.";
  if (trimmed.length > CUSTOM_PACKAGE_TITLE_MAX_LENGTH) return `Keep the title to ${CUSTOM_PACKAGE_TITLE_MAX_LENGTH} characters or fewer.`;
  if (/[<>]/.test(trimmed)) return "The title can't include < or >.";
  return null;
}

/** Renames a custom (uploaded) package; roster packages take their topic from Package Cycle. */
export function TitleDialog({
  open,
  target,
  onSave,
  onClose
}: {
  open: boolean;
  target: TitleTarget | null;
  onSave: (rowId: string, title: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  // Each opening starts from the saved title (state adjusted during render, not in an effect).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTitle(target?.row.groupTopic ?? "");
  }

  const row = target?.row;
  const problem = titleError(title);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!row || saving || problem) return;
    setSaving(true);
    const saved = await onSave(row.id, title.trim());
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
            <DialogTitle>Rename package</DialogTitle>
            <DialogDescription>
              The title shows on the queue and the show, and becomes the YouTube title if you rename it before the upload starts.
            </DialogDescription>
          </DialogHeader>
          <Field label="Title" htmlFor="custom-package-rename" error={title.trim() ? problem : null}>
            <Input
              id="custom-package-rename"
              autoFocus
              maxLength={CUSTOM_PACKAGE_TITLE_MAX_LENGTH}
              aria-invalid={title.trim() && problem ? true : undefined}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || Boolean(problem) || title.trim() === row?.groupTopic}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
