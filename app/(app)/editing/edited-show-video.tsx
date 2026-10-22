"use client";

import { useRef, useState } from "react";

/**
 * The edited show's player. The Editing page reloads its state every 10–60 s, and every load mints a new signed
 * link, so the player keeps the link it started with (a new `src` restarts the video at 0:00). It takes the newest
 * link only when its own stops working (it expired), and picks up where it was. Give it a `key` per job version so
 * a new version starts fresh.
 */
export function EditedShowVideo({ videoUrl, posterUrl, label }: { videoUrl: string; posterUrl: string | null; label: string }) {
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

  return (
    <video
      ref={video}
      src={held.src}
      poster={held.poster ?? undefined}
      controls
      preload="metadata"
      onError={onError}
      onLoadedMetadata={onLoadedMetadata}
      className="aspect-video w-full max-w-3xl rounded-md border border-border bg-black"
      aria-label={label}
    />
  );
}
