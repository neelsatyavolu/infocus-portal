import { cn } from "@/src/lib/utils";

/** Length of the made-up final cut, in seconds (4:32). */
const DURATION = 272;
/** Where the playhead sits: on the note it is showing. */
const PLAYHEAD = 72;

/** Made-up review notes (placeholder names only), pinned to moments in the cut. */
const NOTES = [
  { at: 18, author: "Otto", text: "Hold the wide shot two more seconds before the cut" },
  { at: 72, author: "Abby", text: "Name bar says Producer. Sage is the reporter on this one" },
  { at: 220, author: "Abby", text: "Music covers the voiceover here, bring it down 3 dB" }
] as const;

const pct = (seconds: number) => `${((seconds / DURATION) * 100).toFixed(1)}%`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** The paused frame: a dark picture with the on-air name bar (DESIGN.md §6) the active note is about. */
function Frame() {
  return (
    <div className="relative aspect-video overflow-hidden rounded-md bg-linear-to-b from-[#1c1c20] to-black text-soft-white">
      <span className="timecode absolute right-3 top-3 text-xs text-soft-white/70">00:01:12:08</span>
      <div className="absolute bottom-[12%] left-[6%] flex items-stretch">
        <span aria-hidden className="w-1 bg-[var(--brand-green)]" />
        <div className="bg-black/85 px-3 py-2">
          <p className="text-sm font-medium leading-tight sm:text-base">Sage</p>
          <p className="text-xs leading-tight text-soft-white/70">Producer</p>
        </div>
      </div>
    </div>
  );
}

/** The cut's timeline: the played part, a mark for every note, the active one in the brand color. */
function Timeline() {
  return (
    <div className="relative mt-4 h-4" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--ink-4)]" />
      <div
        className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--brand-green)]"
        style={{ width: pct(PLAYHEAD) }}
      />
      {NOTES.map((note) => (
        <span
          key={note.at}
          className={cn(
            "absolute top-0 h-4 w-0.5 -translate-x-1/2 rounded-full",
            note.at === PLAYHEAD ? "bg-[var(--brand-green)]" : "bg-[var(--ink-5)]"
          )}
          style={{ left: pct(note.at) }}
        />
      ))}
    </div>
  );
}

/** The notes beside the frame, each with its timecode. The one at the playhead sits on a raised row. */
function NoteList() {
  return (
    <ol className="flex flex-col gap-1">
      {NOTES.map((note) => (
        <li
          key={note.at}
          className={cn(
            "grid grid-cols-[2.5rem_1fr] gap-3 rounded-md px-3 py-3",
            note.at === PLAYHEAD && "bg-[var(--ink-3)] ring-1 ring-inset ring-[var(--line)]"
          )}
        >
          <span className={cn("timecode text-xs leading-5", note.at === PLAYHEAD && "text-foreground")}>
            {clock(note.at)}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium leading-5 text-foreground">{note.author}</p>
            <p className="text-[13px] leading-snug text-muted-foreground">{note.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * A still of the Portal's review screen under the hero: one package's final cut, paused on the
 * moment a note is pinned to, with the notes beside it. Built in code with made-up data.
 */
export function ReviewPreview() {
  return (
    <div
      role="img"
      aria-label="A final cut in InFocus Portal review, with three notes pinned to timecodes in the video"
      className="overflow-hidden rounded-lg border border-line-strong bg-card"
    >
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">Bell schedule changes</p>
          <p className="timecode mt-0.5 text-xs">Final cut · v3 · {clock(DURATION)}</p>
        </div>
        <p className="shrink-0 text-xs text-muted-foreground">{NOTES.length} notes</p>
      </div>
      <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div>
          <Frame />
          <Timeline />
        </div>
        <NoteList />
      </div>
    </div>
  );
}
