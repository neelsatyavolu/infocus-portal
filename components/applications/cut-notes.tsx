"use client";

import { useState, type KeyboardEvent } from "react";
import { Pencil, Send, Trash2 } from "lucide-react";
import { IconButton } from "@/components/kit/icon-button";
import { StatusTag } from "@/components/kit/status-tag";
import { AutoGrowTextarea } from "@/components/review/auto-grow-textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatTimestamp, parseTimestamp, type CutNote } from "@/src/lib/applications/answers";
import { isCoarsePointer, shouldEnterSend } from "@/src/lib/enter-to-send";
import { cn } from "@/src/lib/utils";

type Props = {
  notes: CutNote[];
  categories: string[];
  minNotes: number;
  maxNotes: number;
  maxChars: number;
  /** Whole seconds into the rough cut. */
  playhead: number;
  onPause: () => void;
  onSeek: (t: number) => void;
  onChange: (notes: CutNote[]) => void;
};

const TIME_TAG_CLASS =
  "inline-flex h-6 shrink-0 items-center rounded-sm bg-[var(--brand-green)]/12 px-1.5 font-mono-broadcast text-[11px] font-medium tabular-nums text-[var(--brand-green)]";
/** Card actions: shown on hover or focus with a mouse; always shown on touch (like Review comments). */
const REVEAL_CLASS =
  "flex items-center gap-0.5 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover/note:opacity-100 pointer-fine:group-focus-within/note:opacity-100";

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Notes stay in time order, like comments on the Portal's review page. */
function byTime(notes: CutNote[]) {
  return [...notes].sort((a, b) => a.t - b.t);
}

function enterSends(event: KeyboardEvent<HTMLTextAreaElement>) {
  return shouldEnterSend({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing }, isCoarsePointer());
}

/**
 * The rough-cut notes, built like the comments panel on the Portal's review page: a list of compact
 * notes in time order (the time jumps the video there; Edit and Delete on hover), and one box at the
 * bottom that writes a note at the playhead. Typing in it pauses the video.
 */
export function CutNotes({ notes, categories, minNotes, maxNotes, maxChars, playhead, onPause, onSeek, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const full = notes.length >= maxNotes;

  return (
    <section aria-label="Your notes" className="flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <h3 className="text-sm font-semibold">Notes</h3>
        <span className={cn("font-mono text-[12px] tabular-nums", notes.length < minNotes ? "text-muted-foreground" : "text-foreground")}>
          {notes.length} of {minNotes}–{maxNotes}
        </span>
      </div>

      {notes.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground">
          Play the cut. When something needs fixing, type a note below; it&apos;s saved at that moment in the video.
        </p>
      ) : (
        <ol className="space-y-2 overflow-y-auto p-3 lg:max-h-[min(60vh,34rem)]">
          {notes.map((note, index) => (
            <NoteCard
              key={note.id}
              note={note}
              number={index + 1}
              categories={categories}
              maxChars={maxChars}
              editing={editingId === note.id}
              onSeek={onSeek}
              onEdit={() => setEditingId(note.id)}
              onDone={(patch) => {
                setEditingId(null);
                if (patch) onChange(byTime(notes.map((other) => (other.id === note.id ? { ...other, ...patch } : other))));
              }}
              onDelete={() => onChange(notes.filter((other) => other.id !== note.id))}
            />
          ))}
        </ol>
      )}

      <Composer
        categories={categories}
        maxChars={maxChars}
        playhead={playhead}
        full={full}
        maxNotes={maxNotes}
        onPause={onPause}
        onAdd={(category, text) => onChange(byTime([...notes, { id: newId(), t: playhead, category, text }]))}
      />
    </section>
  );
}

function Composer({
  categories,
  maxChars,
  playhead,
  full,
  maxNotes,
  onPause,
  onAdd
}: {
  categories: string[];
  maxChars: number;
  playhead: number;
  full: boolean;
  maxNotes: number;
  onPause: () => void;
  onAdd: (category: string, text: string) => void;
}) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");
  const canAdd = !full && Boolean(text.trim()) && Boolean(category);

  function add() {
    if (!canAdd) return;
    onAdd(category, text.trim());
    setText("");
  }

  if (full) {
    return <p className="border-t border-border px-4 py-3 text-[13px] text-muted-foreground">That&apos;s the most notes allowed ({maxNotes}). Delete one to add another.</p>;
  }

  return (
    <div className="space-y-2 border-t border-border px-4 py-3">
      <AutoGrowTextarea
        value={text}
        maxLength={maxChars}
        onFocus={onPause}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (!enterSends(event)) return;
          event.preventDefault();
          add();
        }}
        rows={2}
        maxHeightPx={160}
        placeholder="What should the reporter fix here, and how?"
        aria-label="Note at the current moment"
        className="min-h-14 resize-none border-[var(--brand-green)]/60 focus-visible:border-[var(--brand-green)]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className={TIME_TAG_CLASS} aria-label={`At ${formatTimestamp(playhead)}`}>
          @ {formatTimestamp(playhead)}
        </span>
        <NativeSelect
          size="sm"
          aria-label="Note category"
          value={category}
          placeholderOption="Category…"
          onChange={(event) => setCategory(event.target.value)}
          wrapperClassName="min-w-32 flex-1"
        >
          {categories.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </NativeSelect>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {text.length}/{maxChars}
        </span>
        <Button type="button" size="sm" className="ml-auto" onClick={add} disabled={!canAdd} title={category ? "Add note (Enter)" : "Pick a category first"}>
          <Send aria-hidden />
          Add
        </Button>
      </div>
    </div>
  );
}

function NoteCard({
  note,
  number,
  categories,
  maxChars,
  editing,
  onSeek,
  onEdit,
  onDone,
  onDelete
}: {
  note: CutNote;
  number: number;
  categories: string[];
  maxChars: number;
  editing: boolean;
  onSeek: (t: number) => void;
  onEdit: () => void;
  onDone: (patch: Partial<CutNote> | null) => void;
  onDelete: () => void;
}) {
  return (
    <li className="group/note min-w-0 rounded-md border border-border bg-[var(--ink-2)] p-3">
      <div className="flex min-h-6 min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onSeek(note.t)}
          title="Jump to this moment"
          className={cn(TIME_TAG_CLASS, "hover:bg-[var(--brand-green)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
        >
          {formatTimestamp(note.t)}
        </button>
        {note.category ? (
          <StatusTag size="sm" tone="neutral">
            {note.category}
          </StatusTag>
        ) : (
          <StatusTag size="sm" tone="warning">
            No category
          </StatusTag>
        )}
        <span className="min-w-2 flex-1" />
        {editing ? null : (
          <div className={REVEAL_CLASS}>
            <IconButton label={`Edit note ${number}`} icon={Pencil} size="sm" onClick={onEdit} />
            <IconButton label={`Delete note ${number}`} icon={Trash2} size="sm" tone="danger" onClick={onDelete} />
          </div>
        )}
        <span className="shrink-0 font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">#{number}</span>
      </div>
      {editing ? (
        <NoteEditor note={note} categories={categories} maxChars={maxChars} onDone={onDone} />
      ) : (
        <p className={cn("mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed", note.text ? "text-foreground" : "text-muted-foreground")}>
          {note.text || "Empty note"}
        </p>
      )}
    </li>
  );
}

function NoteEditor({
  note,
  categories,
  maxChars,
  onDone
}: {
  note: CutNote;
  categories: string[];
  maxChars: number;
  onDone: (patch: Partial<CutNote> | null) => void;
}) {
  const [text, setText] = useState(note.text);
  const [category, setCategory] = useState(note.category);
  const [time, setTime] = useState(formatTimestamp(note.t));
  const parsed = parseTimestamp(time);
  const canSave = Boolean(text.trim()) && parsed !== null;

  function save() {
    if (canSave) onDone({ text: text.trim(), category, t: parsed ?? note.t });
  }

  return (
    <div className="mt-2 space-y-2">
      <AutoGrowTextarea
        value={text}
        maxLength={maxChars}
        autoFocus
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onDone(null);
            return;
          }
          if (!enterSends(event)) return;
          event.preventDefault();
          save();
        }}
        rows={2}
        maxHeightPx={160}
        aria-label="Edit note"
        className="min-h-14 resize-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Note time"
          value={time}
          aria-invalid={parsed === null}
          onChange={(event) => setTime(event.target.value)}
          className="h-8 w-20 font-mono tabular-nums"
        />
        <NativeSelect
          size="sm"
          aria-label="Note category"
          value={category}
          placeholderOption="Category…"
          onChange={(event) => setCategory(event.target.value)}
          wrapperClassName="min-w-32 flex-1"
        >
          {categories.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </NativeSelect>
        <div className="ml-auto flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => onDone(null)}>
            Cancel
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={save} disabled={!canSave}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
