"use client";

import { useState, type SyntheticEvent } from "react";
import { Plus } from "lucide-react";
import { renderIcon, type KitIcon } from "@/components/kit/icon";
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
import { PACKAGE_ROSTER_NOTE_MAX } from "@/src/lib/package-roster-notes";
import { cn } from "@/src/lib/utils";
import { CELL_LABEL, FIELD_BORDER, IN_ROW_HOVER, LINE_HEIGHT } from "./roster-styles";

const NOTE_MAX_LABEL = PACKAGE_ROSTER_NOTE_MAX.toLocaleString("en-US");

// Dialogs portal out of the row, but React events still bubble through it: keep the row's
// click (switch to edit) and right-click (row menu) out of them.
function stop(event: SyntheticEvent) {
  event.stopPropagation();
}

function firstLineOf(text: string) {
  return text.split("\n").find((line) => line.trim())?.trim() ?? "";
}

/**
 * One labelled note (Interviews or Notes): a one-line preview that opens the full note. Editors
 * type in the dialog and it saves when the dialog closes; everyone else reads it there. Rendered
 * in edit mode, or in view mode when the note has text (the cell leaves empty ones out).
 *
 * Card mode: a key/value line (caps label, then the preview or "+ Add"), 40px.
 * Table mode: the 16px icon then the preview on one 32px line. An empty note shrinks to a small
 * "+ icon" button, so a row with no notes stays one line.
 */
export function NoteField({
  label,
  icon,
  value,
  placeholder,
  topic,
  editing,
  disabled = false,
  fullLine = false,
  className,
  onCommit
}: {
  label: string;
  icon: KitIcon;
  value: string;
  placeholder: string;
  topic: string;
  /** Edit mode: the dialog has a text box and the empty preview reads "+ Add". */
  editing: boolean;
  disabled?: boolean;
  /** Table mode: take a whole line (both notes have text, so they stack). */
  fullLine?: boolean;
  className?: string;
  onCommit: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const text = value.trim();
  const hasNote = text.length > 0;
  const topicLabel = topic.trim() || "Untitled package";

  function handleOpenChange(next: boolean) {
    if (next) {
      setDraft(value);
      setOpen(true);
      return;
    }
    const committed = draft.slice(0, PACKAGE_ROSTER_NOTE_MAX);
    if (editing && committed !== value) onCommit(committed);
    setOpen(false);
  }

  const buttonClass = cn(
    "-ml-1.5 flex min-w-0 items-center rounded-md px-[5px] text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    LINE_HEIGHT,
    IN_ROW_HOVER,
    editing ? FIELD_BORDER : "border border-transparent"
  );
  const openDialog = (event: SyntheticEvent) => {
    event.stopPropagation();
    handleOpenChange(true);
  };

  let preview;
  if (hasNote) {
    preview = (
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        title={text.slice(0, 280)}
        onClick={openDialog}
        onPointerDown={stop}
        className={cn(buttonClass, "@4xl:flex-1")}
      >
        <span className="sr-only">
          {label} for {topicLabel}:{" "}
        </span>
        <span className="min-w-0 truncate text-[var(--ink-text)]">{firstLineOf(text)}</span>
      </button>
    );
  } else {
    preview = (
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label={`Add ${label.toLowerCase()} for ${topicLabel}`}
        title={`Add ${label.toLowerCase()}`}
        onClick={openDialog}
        onPointerDown={stop}
        className={cn(buttonClass, "gap-1 text-muted-foreground @4xl:px-1.5")}
      >
        <Plus className="h-4 w-4 shrink-0" aria-hidden />
        <span className="@4xl:hidden">Add</span>
        {renderIcon(icon, "hidden h-4 w-4 shrink-0 @4xl:block")}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-3 @4xl:flex @4xl:items-center @4xl:gap-x-2",
        hasNote ? cn("@4xl:min-w-0 @4xl:flex-1", fullLine && "@4xl:basis-full") : "@4xl:shrink-0",
        className
      )}
    >
      <span
        aria-hidden
        title={label}
        className={cn(CELL_LABEL, "@4xl:flex @4xl:h-8 @4xl:shrink-0 @4xl:items-center", !hasNote && "@4xl:hidden")}
      >
        {renderIcon(icon, "hidden h-4 w-4 @4xl:block")}
        <span className="@4xl:hidden">{label}</span>
      </span>
      {preview}
      {/* The dialog and its overlay portal out, but React events still bubble to the row. */}
      <div className="contents" onClick={stop} onContextMenu={stop}>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent className="max-w-lg" onPointerDown={stop}>
            <DialogHeader>
              <DialogTitle>{label}</DialogTitle>
              <DialogDescription>{topicLabel}</DialogDescription>
            </DialogHeader>
            {editing ? (
              <div className="min-w-0">
                <Textarea
                  value={draft}
                  maxLength={PACKAGE_ROSTER_NOTE_MAX}
                  rows={10}
                  placeholder={placeholder}
                  aria-label={`${label} for ${topicLabel}`}
                  autoFocus
                  onChange={(event) => setDraft(event.target.value.slice(0, PACKAGE_ROSTER_NOTE_MAX))}
                  className="min-h-48 resize-y leading-6"
                />
                <p className="mt-1.5 text-right font-mono-broadcast text-xs tabular-nums text-muted-foreground">
                  {draft.length.toLocaleString("en-US")} / {NOTE_MAX_LABEL}
                </p>
              </div>
            ) : (
              <div className="max-h-[60dvh] min-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border px-3 py-2 text-sm leading-6 text-foreground">
                {value}
              </div>
            )}
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
