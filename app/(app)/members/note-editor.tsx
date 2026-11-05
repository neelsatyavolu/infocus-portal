"use client";

import type { KeyboardEvent, RefObject } from "react";
import { SaveState, type SaveStateValue } from "@/components/kit/status-tag";
import { AutoGrowTextarea } from "@/components/people/auto-grow-textarea";
import { MEMBER_GENERAL_CYCLE_NUMBER, MEMBER_NOTE_MAX } from "@/src/lib/member-notes";
import { cn } from "@/src/lib/utils";
import { cycleCode } from "./member-notes-model";

export type EditorHandlers = {
  noteState: (key: string) => SaveStateValue;
  errorFor: (key: string) => string | undefined;
  onChange: (key: string, value: string) => void;
  onFlush: (key: string) => void;
};

const NOTE_MAX_LABEL = MEMBER_NOTE_MAX.toLocaleString("en-US");
/** The count only shows once a note nears the limit (amber from 90%). */
const COUNT_FROM = MEMBER_NOTE_MAX * 0.8;
const COUNT_WARN_FROM = MEMBER_NOTE_MAX * 0.9;

export function notesLabel(cycleNumber: number, name: string) {
  return cycleNumber === MEMBER_GENERAL_CYCLE_NUMBER ? `General notes for ${name}` : `Cycle ${cycleNumber} notes for ${name}`;
}

export function notesPlaceholder(cycleNumber: number) {
  return cycleNumber === MEMBER_GENERAL_CYCLE_NUMBER ? "General notes…" : `Notes for cycle ${cycleCode(cycleNumber)}…`;
}

/** "3,612 / 4,000", only near the limit. */
export function NoteCount({ length }: { length: number }) {
  if (length < COUNT_FROM) return null;
  return (
    <span
      className={cn(
        "font-mono-broadcast text-[11px] tabular-nums",
        length >= COUNT_WARN_FROM ? "text-[var(--brand-amber)]" : "text-muted-foreground"
      )}
    >
      {length.toLocaleString("en-US")} / {NOTE_MAX_LABEL}
    </span>
  );
}

/**
 * One autosaving note field: saves 700 ms after typing stops and on blur. Esc leaves the field
 * (which saves it); ⌘/Ctrl+Enter runs `onSaveAndNext` when given.
 */
export function NoteField({
  id,
  noteKey,
  value,
  placeholder,
  ariaLabel,
  size,
  textareaRef,
  onSaveAndNext,
  handlers
}: {
  id?: string;
  noteKey: string;
  value: string;
  placeholder: string;
  /** When there is no visible <label for>. */
  ariaLabel?: string;
  size: "lg" | "md";
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  onSaveAndNext?: () => void;
  handlers: EditorHandlers;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && onSaveAndNext) {
      event.preventDefault();
      onSaveAndNext();
    }
  }

  return (
    <AutoGrowTextarea
      ref={textareaRef}
      id={id}
      aria-label={ariaLabel}
      value={value}
      maxLength={MEMBER_NOTE_MAX}
      rows={size === "lg" ? 6 : 3}
      placeholder={placeholder}
      onChange={(event) => handlers.onChange(noteKey, event.target.value)}
      onBlur={() => handlers.onFlush(noteKey)}
      onKeyDown={onKeyDown}
      className={size === "lg" ? "min-h-40 max-h-[60dvh]" : "min-h-[4.5rem] max-h-[40dvh]"}
    />
  );
}

/** A labelled note: caps label, cycle focus, save state and (near the limit) a count, then the field. */
export function NoteEditor({
  noteKey,
  label,
  focus,
  srLabel,
  placeholder,
  value,
  size,
  textareaRef,
  onSaveAndNext,
  handlers
}: {
  noteKey: string;
  label: string;
  focus?: string;
  srLabel: string;
  placeholder: string;
  value: string;
  size: "lg" | "md";
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  onSaveAndNext?: () => void;
  handlers: EditorHandlers;
}) {
  const fieldId = `member-note-${noteKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-h-6 min-w-0 items-center gap-2">
        <label htmlFor={fieldId} className="shrink-0 text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground">
          <span aria-hidden>{label}</span>
          <span className="sr-only">{srLabel}</span>
        </label>
        {focus ? <span className="min-w-0 truncate text-[13px] text-muted-foreground">{focus}</span> : null}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <SaveState state={handlers.noteState(noteKey)} title={handlers.errorFor(noteKey)} />
          <NoteCount length={value.length} />
        </span>
      </div>
      <NoteField
        id={fieldId}
        noteKey={noteKey}
        value={value}
        placeholder={placeholder}
        size={size}
        textareaRef={textareaRef}
        onSaveAndNext={onSaveAndNext}
        handlers={handlers}
      />
    </div>
  );
}
