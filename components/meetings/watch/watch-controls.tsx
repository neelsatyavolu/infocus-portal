"use client";

import { pointerSafeAutoFocus } from "@/components/meetings/focus-modality";
import { useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Clapperboard, Maximize, MoreHorizontal, Pause, Play, Replace, Square, Volume2, VolumeX } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatWatchTime } from "@/src/lib/meetings/client/watch-sync";
import { cn } from "@/src/lib/utils";
import { MENU_SURFACE, MenuRow } from "../call/menu-row";
import { OVERLAY_PLATE } from "../call/overlay";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]";
/** Fixed Danger on Dark: the overlay stays dark in Light mode, where --danger-text turns crimson. */
const STOP_TEXT = "text-[#FF7A8A]";
/** Below this tile width the shared actions fold into one menu (the time and cycle always show). */
const NARROW_SHOW = "@max-[22.5rem]:hidden";
const NARROW_ONLY = "hidden @max-[22.5rem]:flex";
/**
 * Range inputs: a 32px hit area (the native track stays thin), so seek and volume are easy to
 * grab on a phone, where the watch tile is the stage.
 */
const RANGE = "block h-8 cursor-pointer disabled:cursor-default";

function ControlButton({ label, tooltip, onClick, children }: { label: string; tooltip?: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] text-[var(--soft-white)] hover:bg-[#ECEFEA]/10 [&_svg]:size-5",
            FOCUS
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip ?? label}</TooltipContent>
    </Tooltip>
  );
}

/** Narrow tiles: Watch a different cut and Stop for everyone behind one "For everyone" button. */
function ForEveryoneMenu({ onChange, onStop }: { onChange: () => void; onStop: () => void }) {
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="For everyone"
          className={cn(
            "h-11 w-11 shrink-0 items-center justify-center rounded-[6px] text-[var(--soft-white)] hover:bg-[#ECEFEA]/10 [&_svg]:size-5",
            NARROW_ONLY,
            FOCUS
          )}
        >
          <MoreHorizontal />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content onOpenAutoFocus={pointerSafeAutoFocus} side="bottom" align="end" sideOffset={4} className={cn(MENU_SURFACE, "w-64")}>
          <MenuRow icon={<Replace />} title="Watch a different cut" detail="Pick a new cut for everyone" onSelect={run(onChange)} />
          <MenuRow icon={<Square className="text-danger" />} title="Stop for everyone" detail="Ends the video for the whole call" onSelect={run(onStop)} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * The watch tile's top plate: what is playing, and (on the stage, not the strip) the actions that
 * change it for everyone, kept apart from the personal controls at the bottom.
 */
export function WatchHeader({
  title,
  cycle,
  small,
  onChange,
  onStop
}: {
  title: string;
  cycle: number | null;
  small: boolean;
  /** Shared actions; left out in the strip and while the cut loads. */
  onChange?: () => void;
  onStop?: () => void;
}) {
  return (
    <div
      className={cn(
        "absolute inset-x-0 top-0 flex items-center gap-2 pl-3",
        OVERLAY_PLATE,
        small ? "pointer-events-none h-8 pr-3" : "h-11 pr-1"
      )}
    >
      <Clapperboard className="h-4 w-4 shrink-0" aria-hidden />
      <span className={cn("min-w-0 flex-1 truncate font-medium", small ? "text-xs" : "text-sm")}>{title}</span>
      {cycle !== null ? (
        <span className="shrink-0 whitespace-nowrap rounded-[4px] bg-[#ECEFEA]/10 px-1.5 py-0.5 font-mono text-[11px] tabular-nums">
          Cycle {cycle}
        </span>
      ) : null}
      {onChange && onStop ? (
        <>
          <div className={cn("flex shrink-0 items-center", NARROW_SHOW)}>
            <ControlButton label="Watch a different cut" tooltip="Pick a different cut for everyone" onClick={onChange}>
              <Replace />
            </ControlButton>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Stop for everyone"
                  onClick={onStop}
                  className={cn(
                    "flex h-11 shrink-0 items-center gap-1.5 rounded-[6px] px-3 text-sm font-medium hover:bg-[#ECEFEA]/10 [&_svg]:size-4",
                    STOP_TEXT,
                    FOCUS
                  )}
                >
                  <Square aria-hidden />
                  Stop
                </button>
              </TooltipTrigger>
              <TooltipContent>Stop for everyone</TooltipContent>
            </Tooltip>
          </div>
          <ForEveryoneMenu onChange={onChange} onStop={onStop} />
        </>
      ) : null}
    </div>
  );
}

/**
 * The bottom plate: seek and play/pause are shared (everyone in the call), the right-hand group is
 * just this device (mute, volume, full screen). On the main stage seek runs full width above a 44px
 * button row; on grid tiles (`compact`) everything shares one 44px row, so the plate covers as
 * little of the picture as possible.
 */
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
}) {
  const duration = Number.isFinite(props.duration) && props.duration > 0 ? props.duration : 0;
  const seek = (
    <input
      type="range"
      aria-label="Seek for everyone"
      min={0}
      max={duration || 1}
      step={0.1}
      value={Math.min(props.time, duration || 1)}
      disabled={!duration}
      onChange={(event) => props.onScrub(Number(event.target.value))}
      className={cn(RANGE, "accent-[var(--brand-green)]", props.compact ? "min-w-0 flex-1" : "w-full", FOCUS)}
    />
  );
  const time = (
    <span
      className={cn(
        "truncate whitespace-nowrap px-1 font-mono text-xs tabular-nums",
        props.compact ? cn("shrink-0", NARROW_SHOW) : "min-w-0 flex-1"
      )}
    >
      {formatWatchTime(props.time)} / {formatWatchTime(duration)}
    </span>
  );
  return (
    <div className={cn("absolute inset-x-0 bottom-0 px-2", !props.compact && "pt-1", OVERLAY_PLATE)}>
      {!props.compact ? seek : null}
      <div className="flex h-11 items-center gap-1">
        <ControlButton label={props.playing ? "Pause for everyone" : "Play for everyone"} onClick={props.onPlayPause}>
          {props.playing ? <Pause /> : <Play />}
        </ControlButton>
        {props.compact ? seek : null}
        {/* On the stage it truncates before the buttons are squeezed; grid tiles drop it when narrow. */}
        {time}
        <div role="group" aria-label="Just for you" className="flex items-center gap-1">
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
              className={cn(RANGE, "mr-1 w-20 accent-[var(--soft-white)]", FOCUS)}
            />
          ) : null}
          <ControlButton label="Full screen" tooltip="Full screen (just you)" onClick={props.onFullscreen}>
            <Maximize />
          </ControlButton>
        </div>
      </div>
    </div>
  );
}
