import { cn } from "@/src/lib/utils";

/** Length of the made-up final cut, in seconds (4:32). */
const DURATION = 272;
/** Where the playhead sits: on the note it is showing. */
const PLAYHEAD = 72;

/** Made-up review notes (placeholder names only), pinned to moments in the cut. */
const NOTES = [
  { at: 18, author: "Otto", text: "Hold the wide shot two more seconds before the cut" },
  { at: 72, author: "Abby", text: "Period 3 starts at 10:20, after brunch. The card says 10:05" },
  { at: 220, author: "Abby", text: "Music covers the voiceover here, bring it down 3 dB" }
] as const;

/** The made-up schedule on the paused card. Period 3 is the mistake the active note points at. */
const SCHEDULE = [
  { label: "Period 1", time: "8:25" },
  { label: "Period 2", time: "9:20" },
  { label: "Brunch", time: "10:10" },
  { label: "Period 3", time: "10:05" }
] as const;

const pct = (seconds: number) => `${((seconds / DURATION) * 100).toFixed(1)}%`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * The paused frame: the package's full-screen announcement card (DESIGN.md §6, Announcement), drawn
 * at 1920 × 1080 proportions in container units so it scales with the frame. On-air colors are
 * fixed hexes, as the graphic itself is (DESIGN.md §10 allows hexes inside on-air graphics).
 */
function Frame() {
  return (
    <div className="@container relative aspect-video overflow-hidden rounded-md bg-[#0F110F] font-[family-name:var(--font-lexend)] text-[#ECEFEA]">
      <div className="absolute inset-x-[6.25cqw] top-[5cqw]">
        <div className="flex items-center justify-between border-b-[max(1px,0.16cqw)] border-[#ECEFEA]/30 pb-[2cqw]">
          <p className="flex items-center gap-[1cqw] text-[2cqw] font-bold uppercase tracking-[0.18em] text-[#2BB36E]">
            <span aria-hidden className="size-[1.4cqw] rounded-full bg-[#EE3A2A]" />
            Announcements
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed 1200×321 brand PNG, no resizing needed */}
          <img src="/brand/infocus-wordmark-white.png" alt="" width={1200} height={321} className="h-[3.6cqw] w-auto" />
        </div>
        <p className="mt-[4cqw] text-[6cqw] font-semibold leading-none">New bell schedule</p>
        <ul className="mt-[3.5cqw] w-[50cqw] space-y-[0.9cqw] text-[3.3cqw] leading-tight text-[#DCE2DE]">
          {SCHEDULE.map((row) => (
            <li key={row.label} className="flex items-center gap-[1.6cqw]">
              <span aria-hidden className="size-[1cqw] shrink-0 rounded-full bg-[#2BB36E]" />
              <span className="flex-1">{row.label}</span>
              <span className="tabular-nums">{row.time}</span>
            </li>
          ))}
        </ul>
      </div>
      <span className="timecode absolute right-[1.6cqw] top-[1.2cqw] font-mono text-[max(10px,1.5cqw)] text-[#ECEFEA]/60">
        00:01:12:08
      </span>
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
