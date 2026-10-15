"use client";

import type { FormEvent, ReactNode } from "react";
import { Alert } from "@/components/kit/alert";
import { Field, fieldClass } from "@/components/kit/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** One form dialog: H3 title, one line, fields, an error inside the dialog, Cancel + primary. Enter submits. */
function FormDialog({
  open,
  busy,
  title,
  description,
  error,
  submitLabel,
  busyLabel,
  submitDisabled,
  onCancel,
  onSubmit,
  className,
  children
}: {
  open: boolean;
  busy: boolean;
  title: string;
  description: string;
  error?: string | null;
  submitLabel: string;
  busyLabel: string;
  submitDisabled: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  className?: string;
  children: ReactNode;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    if (submitDisabled || busy) return;
    onSubmit();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && busy) return;
        if (!isOpen) onCancel();
      }}
    >
      <DialogContent className={className}>
        <form onSubmit={submit} className="grid min-w-0 gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          {error ? <Alert tone="danger" compact>{error}</Alert> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || submitDisabled}>
              {busy ? busyLabel : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RenameDialog({
  open,
  value,
  busy,
  error,
  onChange,
  onCancel,
  onSubmit
}: {
  open: boolean;
  value: string;
  busy: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <FormDialog
      open={open}
      busy={busy}
      title="Rename video"
      description="Update this video title."
      error={error}
      submitLabel="Save"
      busyLabel="Saving..."
      submitDisabled={!value.trim()}
      onCancel={onCancel}
      onSubmit={onSubmit}
    >
      <Field label="Video title" htmlFor="rename-video-title">
        <input
          id="rename-video-title"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Video title"
          autoFocus
          className={fieldClass}
        />
      </Field>
    </FormDialog>
  );
}

export function CreateFolderDialog({
  open,
  value,
  destination,
  busy,
  error,
  onChange,
  onCancel,
  onSubmit
}: {
  open: boolean;
  value: string;
  /** "Creates inside Group 4" / "Creates at the top of Cycle 3". */
  destination: string;
  busy: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <FormDialog
      open={open}
      busy={busy}
      title="Create folder"
      description="Organize your assets with a dedicated folder."
      error={error}
      submitLabel="Create folder"
      busyLabel="Creating..."
      submitDisabled={!value.trim()}
      onCancel={onCancel}
      onSubmit={onSubmit}
    >
      <Field label="Folder name" htmlFor="create-folder-name" hint={destination}>
        <input
          id="create-folder-name"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Folder name"
          aria-describedby="create-folder-name-hint"
          autoFocus
          className={fieldClass}
        />
      </Field>
    </FormDialog>
  );
}

export function MoveIntoVersionDialog({
  open,
  sourceTitle,
  sourceVersionCount,
  candidates,
  targetId,
  targetTitle,
  busy,
  error,
  onTargetChange,
  onCancel,
  onSubmit
}: {
  open: boolean;
  sourceTitle: string | null;
  sourceVersionCount: number;
  candidates: { id: string; title: string }[];
  targetId: string;
  targetTitle: string | null;
  busy: boolean;
  error: string | null;
  onTargetChange: (targetId: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <FormDialog
      open={open}
      busy={busy}
      title="Move into version"
      description="Move the selected upload into the correct package as its newest version."
      error={error}
      submitLabel="Move into version"
      busyLabel="Moving..."
      submitDisabled={!targetId || candidates.length === 0}
      onCancel={onCancel}
      onSubmit={onSubmit}
    >
      <dl className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-x-3 rounded-md border border-border px-3 py-2.5">
        <dt className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">Moving</dt>
        <dd className="min-w-0 truncate text-sm font-semibold text-foreground">{sourceTitle ?? "Selected package"}</dd>
      </dl>
      <Field label="Correct package" htmlFor="move-into-version-target">
        <Select value={targetId} onValueChange={onTargetChange} disabled={busy || candidates.length === 0}>
          <SelectTrigger id="move-into-version-target">
            <SelectValue placeholder="Choose a package" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {targetTitle ? (
        <p className="text-[13px] text-muted-foreground">
          This will add {sourceVersionCount} version{sourceVersionCount === 1 ? "" : "s"} to {targetTitle} and merge any
          people assigned to the duplicate.
        </p>
      ) : null}
    </FormDialog>
  );
}

export function MarkAiredDialog({
  open,
  date,
  busy,
  onDateChange,
  onCancel,
  onSubmit
}: {
  open: boolean;
  date: string;
  busy: boolean;
  onDateChange: (date: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <FormDialog
      open={open}
      busy={busy}
      title="Mark as aired"
      description="Pick the date this video aired."
      submitLabel="Mark as aired"
      busyLabel="Saving..."
      submitDisabled={!date}
      onCancel={onCancel}
      onSubmit={onSubmit}
      className="sm:max-w-sm"
    >
      <Field label="Air date" htmlFor="tile-aired-date">
        <input
          id="tile-aired-date"
          type="date"
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
          className={fieldClass}
        />
      </Field>
    </FormDialog>
  );
}
