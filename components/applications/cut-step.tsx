"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Film, MessageSquarePlus, Trash2 } from "lucide-react";
import { RoughCutPlayer } from "@/components/applications/rough-cut-player";
import { WordCount } from "@/components/applications/word-count";
import { EmptyState } from "@/components/kit/empty-state";
import { Field, FormSection } from "@/components/kit/field";
import { IconButton } from "@/components/kit/icon-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatTimestamp, parseTimestamp, type ApplicationAnswers, type CutNote } from "@/src/lib/applications/answers";
import type { ApplicantConfig } from "@/src/lib/applications/config";

type Props = {
  roundId: string;
  hasRoughCut: boolean;
  answers: ApplicationAnswers;
  config: ApplicantConfig;
  onChange: (patch: Partial<ApplicationAnswers>) => void;
};

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Section 3: watch the rough cut, take timestamped notes, then the top-three summary and air call. */
export function CutStep({ roundId, hasRoughCut, answers, config, onChange }: Props) {
  const cut = config.roughCut;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const notes = answers.cutNotes;
  const setNotes = (next: CutNote[]) => onChange({ cutNotes: next });
  const update = (id: string, patch: Partial<CutNote>) => setNotes(notes.map((note) => (note.id === id ? { ...note, ...patch } : note)));

  function addNote() {
    const video = videoRef.current;
    video?.pause();
    const t = Math.floor(video?.currentTime ?? 0);
    setNotes([...notes, { id: newId(), t, category: "", text: "" }]);
    // Focus the new note's text once it renders.
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("[data-cut-note]:last-of-type textarea")?.focus());
  }

  function seek(t: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = t;
    video.focus();
  }

  function move(index: number, to: number) {
    if (to < 0 || to >= notes.length) return;
    const next = [...notes];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item as CutNote);
    setNotes(next);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="max-w-[70ch] text-[15px] font-medium leading-snug">{cut.instructions}</p>
        {cut.context ? <p className="max-w-[70ch] whitespace-pre-line text-sm text-muted-foreground">{cut.context}</p> : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="space-y-3 lg:sticky lg:top-[calc(3.5rem+1.5rem)]">
          {hasRoughCut ? (
            <RoughCutPlayer roundId={roundId} videoRef={videoRef} className="rounded-md" />
          ) : (
            <EmptyState icon={Film} title="The rough cut isn't posted yet" description="Check back soon. You can fill in the other sections meanwhile." />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" onClick={addNote} disabled={notes.length >= cut.maxNotes}>
              <MessageSquarePlus aria-hidden />
              Add note at current time
            </Button>
            <span className="font-mono text-[13px] tabular-nums text-muted-foreground">
              {notes.length} note{notes.length === 1 ? "" : "s"} · {cut.minNotes}–{cut.maxNotes}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {notes.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              Play the cut and press <span className="font-medium text-foreground">Add note at current time</span> whenever you’d give the reporter a note.
            </p>
          ) : (
            <ol className="space-y-3">
              {notes.map((note, index) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  index={index}
                  count={notes.length}
                  categories={cut.categories}
                  maxChars={cut.noteMaxChars}
                  onSeek={seek}
                  onUpdate={(patch) => update(note.id, patch)}
                  onMove={(to) => move(index, to)}
                  onDelete={() => setNotes(notes.filter((other) => other.id !== note.id))}
                />
              ))}
            </ol>
          )}
        </div>
      </div>

      <FormSection title="Your call">
        <Field label={cut.summaryPrompt} htmlFor="app-summary" required>
          <Textarea id="app-summary" rows={6} value={answers.cutSummary} onChange={(e) => onChange({ cutSummary: e.target.value })} aria-describedby="app-summary-count" />
          <WordCount id="app-summary-count" value={answers.cutSummary} max={cut.summaryMaxWords} />
        </Field>
        <Field label="Air decision" required>
          <div role="radiogroup" aria-label="Air decision" className="flex flex-wrap gap-2">
            {cut.airOptions.map((option) => (
              <Button
                key={option}
                type="button"
                role="radio"
                aria-checked={answers.airDecision === option}
                variant={answers.airDecision === option ? "default" : "outline"}
                onClick={() => onChange({ airDecision: option })}
              >
                {option}
              </Button>
            ))}
          </div>
        </Field>
        <Field label="One sentence of reasoning" htmlFor="app-air-reason" required>
          <Input id="app-air-reason" value={answers.airReason} onChange={(e) => onChange({ airReason: e.target.value })} aria-describedby="app-air-count" />
          <WordCount id="app-air-count" value={answers.airReason} max={cut.airReasonMaxWords} />
        </Field>
      </FormSection>
    </div>
  );
}

function NoteRow({
  note,
  index,
  count,
  categories,
  maxChars,
  onSeek,
  onUpdate,
  onMove,
  onDelete
}: {
  note: CutNote;
  index: number;
  count: number;
  categories: string[];
  maxChars: number;
  onSeek: (t: number) => void;
  onUpdate: (patch: Partial<CutNote>) => void;
  onMove: (to: number) => void;
  onDelete: () => void;
}) {
  const [time, setTime] = useState(formatTimestamp(note.t));
  const [timeError, setTimeError] = useState(false);
  return (
    <li data-cut-note className="space-y-2 rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="font-mono tabular-nums" onClick={() => onSeek(note.t)} aria-label={`Jump to ${formatTimestamp(note.t)}`}>
          {formatTimestamp(note.t)}
        </Button>
        <Input
          aria-label={`Note ${index + 1} time`}
          value={time}
          aria-invalid={timeError}
          onChange={(e) => setTime(e.target.value)}
          onBlur={() => {
            const parsed = parseTimestamp(time);
            setTimeError(parsed === null);
            if (parsed !== null) {
              onUpdate({ t: parsed });
              setTime(formatTimestamp(parsed));
            }
          }}
          className="h-8 w-20 font-mono tabular-nums"
        />
        <NativeSelect
          size="sm"
          aria-label={`Note ${index + 1} category`}
          value={note.category}
          placeholderOption="Category…"
          onChange={(e) => onUpdate({ category: e.target.value })}
          wrapperClassName="min-w-0 flex-1"
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </NativeSelect>
        <div className="flex">
          <IconButton label="Move note up" icon={ArrowUp} size="sm" variant="ghost" disabled={index === 0} onClick={() => onMove(index - 1)} />
          <IconButton label="Move note down" icon={ArrowDown} size="sm" variant="ghost" disabled={index === count - 1} onClick={() => onMove(index + 1)} />
          <IconButton label="Delete note" icon={Trash2} size="sm" variant="ghost" onClick={onDelete} />
        </div>
      </div>
      <Textarea
        aria-label={`Note ${index + 1}`}
        rows={2}
        value={note.text}
        maxLength={maxChars}
        onChange={(e) => onUpdate({ text: e.target.value })}
        placeholder="What should the reporter fix, and how?"
      />
      <p className="text-right font-mono text-[12px] tabular-nums text-muted-foreground">
        {note.text.length} / {maxChars}
      </p>
    </li>
  );
}
