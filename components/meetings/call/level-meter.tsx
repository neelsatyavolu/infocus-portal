"use client";

import { cn } from "@/src/lib/utils";
import { useTrackLevel } from "./use-call-helpers";

const COMPACT_LIT_HEIGHTS = ["55%", "80%", "100%"];

/** Mic level bars. `compact` = 3 small bars for the preview corner; otherwise an 8-bar meter. */
export function LevelMeter({ track, compact }: { track: MediaStreamTrack | undefined; compact?: boolean }) {
  const level = useTrackLevel(track);
  const bars = compact ? 3 : 8;
  const lit = Math.round(Math.min(1, level * 1.6) * bars);
  return (
    <div
      role="meter"
      aria-label="Microphone level"
      aria-valuenow={lit}
      aria-valuemin={0}
      aria-valuemax={bars}
      className={cn("flex items-end", compact ? "h-3.5 gap-[3px]" : "h-4 gap-0.5")}
    >
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={cn(
            "rounded-full transition-[height,background-color] duration-100",
            compact ? "w-[3px]" : "w-1",
            i < lit ? "bg-[var(--brand-green)]" : compact ? "bg-[var(--soft-white)]/50" : "bg-[var(--ink-4)]"
          )}
          style={{ height: compact ? (i < lit ? COMPACT_LIT_HEIGHTS[i] : "35%") : `${30 + i * 10}%` }}
        />
      ))}
    </div>
  );
}
