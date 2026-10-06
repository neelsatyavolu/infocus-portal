"use client";

import { Maximize, Pause, Play, Replace, Square, Volume2, VolumeX } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatWatchTime } from "@/src/lib/meetings/client/watch-sync";
import { cn } from "@/src/lib/utils";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]";

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] text-[var(--soft-white)] hover:bg-white/10 [&_svg]:size-5", FOCUS)}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Shared playback controls (everyone in the call can use them) plus this device's own volume. */
export function WatchControls(props: {
  playing: boolean;
  time: number;
  duration: number;
  volume: number;
  muted: boolean;
  compact: boolean;
  onPlayPause: () => void;
  onScrub: (seconds: number) => void;
  onVolume: (volume: number) => void;
  onMute: () => void;
  onFullscreen: () => void;
  onChange: () => void;
  onStop: () => void;
}) {
  const duration = Number.isFinite(props.duration) && props.duration > 0 ? props.duration : 0;
  return (
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0F110F]/90 via-[#0F110F]/60 to-transparent px-2 pb-1 pt-6">
      <input
        type="range"
        aria-label="Seek for everyone"
        min={0}
        max={duration || 1}
        step={0.1}
        value={Math.min(props.time, duration || 1)}
        disabled={!duration}
        onChange={(event) => props.onScrub(Number(event.target.value))}
        className={cn("h-2 w-full cursor-pointer accent-[var(--brand-green)] disabled:cursor-default", FOCUS)}
      />
      <div className="flex items-center gap-1">
        <ControlButton label={props.playing ? "Pause for everyone" : "Play for everyone"} onClick={props.onPlayPause}>
          {props.playing ? <Pause /> : <Play />}
        </ControlButton>
        <span className="px-1 font-mono text-xs tabular-nums text-[var(--soft-white)]">
          {formatWatchTime(props.time)} / {formatWatchTime(duration)}
        </span>
        <div className="flex-1" />
        <ControlButton label={props.muted ? "Turn sound on (just you)" : "Mute (just you)"} onClick={props.onMute}>
          {props.muted ? <VolumeX /> : <Volume2 />}
        </ControlButton>
        {!props.compact ? (
          <input
            type="range"
            aria-label="Your volume"
            min={0}
            max={1}
            step={0.05}
            value={props.muted ? 0 : props.volume}
            onChange={(event) => props.onVolume(Number(event.target.value))}
            className={cn("h-2 w-20 cursor-pointer accent-[var(--soft-white)]", FOCUS)}
          />
        ) : null}
        <ControlButton label="Watch a different cut" onClick={props.onChange}>
          <Replace />
        </ControlButton>
        <ControlButton label="Full screen" onClick={props.onFullscreen}>
          <Maximize />
        </ControlButton>
        <ControlButton label="Stop for everyone" onClick={props.onStop}>
          <Square />
        </ControlButton>
      </div>
    </div>
  );
}
