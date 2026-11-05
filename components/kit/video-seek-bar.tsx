import { useRef, useState, type PointerEvent } from "react";
import type { ShowChapter } from "@/src/lib/show-chapters";
import { chapterTime } from "@/src/lib/show-chapters";
import { chapterAt } from "@/src/lib/video-player";
import type { BufferedSpan } from "@/src/lib/video-buffer";
import { cn } from "@/src/lib/utils";

const pctOf = (value: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0);

/**
 * The shared player's seek bar. Always on a dark picture, so it draws in Soft White in both themes, with the
 * played part in InFocus Green. Chapters cut small gaps into the track; hovering shows the time (and chapter)
 * under the pointer. A native range input on top keeps it keyboard- and screen-reader-friendly.
 */
export function VideoSeekBar({ time, duration, buffered, chapters, onSeek }: {
  time: number;
  duration: number;
  buffered: BufferedSpan[];
  chapters: ShowChapter[];
  onSeek: (time: number) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const played = pctOf(time, duration);
  const hoverChapter = hover === null ? null : chapterAt(chapters, hover);

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0 || duration <= 0) return;
    setHover((Math.max(0, Math.min(box.width, event.clientX - box.left)) / box.width) * duration);
  }

  return (
    <div
      ref={track}
      className="group/seek relative h-4 pointer-coarse:h-8"
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHover(null)}
    >
      <input
        type="range"
        min={0}
        max={duration > 0 ? duration : 1}
        step={0.01}
        value={Math.min(time, duration > 0 ? duration : 1)}
        disabled={duration <= 0}
        onChange={(event) => onSeek(Number(event.target.value))}
        aria-label="Seek"
        aria-valuetext={`${chapterTime(time)} of ${chapterTime(duration)}`}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-default"
      />
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-soft-white/20 transition-[height] group-hover/seek:h-1.5">
        {buffered.map((span) => (
          <div
            key={span.startPct}
            className="absolute inset-y-0 bg-soft-white/35"
            style={{ left: `${span.startPct}%`, width: `${span.endPct - span.startPct}%` }}
          />
        ))}
        {hover !== null ? (
          <div className="absolute inset-y-0 left-0 bg-soft-white/25" style={{ width: `${pctOf(hover, duration)}%` }} />
        ) : null}
        <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${played}%` }} />
        {chapters.slice(1).map((chapter) => (
          <div
            key={`${chapter.start}-${chapter.title}`}
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-black"
            style={{ left: `${pctOf(chapter.start, duration)}%` }}
          />
        ))}
      </div>
      <div
        className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-soft-white transition-transform group-hover/seek:scale-100 peer-focus-visible:scale-100 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--brand-green)]"
        style={{ left: `${played}%` }}
      />
      {hover !== null ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-soft-white/15 bg-black/90 px-2 py-1 text-center",
            "max-w-[16rem]"
          )}
          style={{ left: `clamp(3rem, ${pctOf(hover, duration)}%, calc(100% - 3rem))` }}
        >
          {hoverChapter && chapters.length > 1 ? (
            <span className="block truncate text-[12px] text-soft-white">{hoverChapter.title}</span>
          ) : null}
          <span className="block font-mono-broadcast text-[12px] tabular-nums text-soft-white/80">{chapterTime(hover)}</span>
        </div>
      ) : null}
    </div>
  );
}
