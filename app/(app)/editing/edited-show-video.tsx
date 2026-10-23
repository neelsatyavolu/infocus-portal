"use client";

import { useRef, useState } from "react";
import { VideoPlayer } from "@/components/kit/video-player";
import { chapterTime, type ShowChapter } from "@/src/lib/show-chapters";

/**
 * The edited show's player. The Editing page reloads its state every 10–60 s, and every load mints a new signed
 * link, so the player keeps the link it started with (a new `src` restarts the video at 0:00). It takes the newest
 * link only when its own stops working (it expired), and picks up where it was. Give it a `key` per job version so
 * a new version starts fresh. Its chapters (from the editor) mark the seek bar and sit underneath: each one jumps there.
 */
export function EditedShowVideo({ videoUrl, posterUrl, label, chapters = [] }: {
  videoUrl: string; posterUrl: string | null; label: string; chapters?: ShowChapter[];
}) {
  const [held, setHeld] = useState({ src: videoUrl, poster: posterUrl });
  const resume = useRef<{ time: number; playing: boolean } | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  function onError() {
    const element = video.current;
    if (!element || held.src === videoUrl) return;
    resume.current = { time: element.currentTime, playing: !element.paused };
    setHeld({ src: videoUrl, poster: posterUrl });
  }

  function onLoadedMetadata() {
    const element = video.current;
    const at = resume.current;
    if (!element || !at) return;
    resume.current = null;
    element.currentTime = at.time;
    if (at.playing) void element.play().catch(() => undefined);
  }

  function jump(start: number) {
    const element = video.current;
    if (!element) return;
    element.currentTime = start;
    void element.play().catch(() => undefined);
  }

  return (
    <div className="max-w-3xl space-y-2">
      <VideoPlayer
        ref={video}
        src={held.src}
        poster={held.poster}
        preload="metadata"
        chapters={chapters}
        onError={onError}
        onLoadedMetadata={onLoadedMetadata}
        className="rounded-md border border-border"
        label={label}
      />
      {chapters.length > 1 ? (
        <nav aria-label="Chapters">
          <ol className="flex flex-wrap gap-1.5">
            {chapters.map((chapter) => (
              <li key={`${chapter.start}-${chapter.title}`}>
                <button
                  type="button"
                  onClick={() => jump(chapter.start)}
                  className="rounded-md border border-border px-2 py-1 text-[13px] hover:bg-muted"
                >
                  <span className="font-mono text-[12px] text-muted-foreground tabular-nums">{chapterTime(chapter.start)}</span>{" "}
                  {chapter.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
    </div>
  );
}
