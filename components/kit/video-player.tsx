"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref, type SyntheticEvent } from "react";
import {
  AlertTriangle, Loader2, Maximize, Minimize, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, Volume1, Volume2, VolumeX
} from "lucide-react";
import { useVideoPlayer, type VideoPlayerState } from "@/components/kit/use-video-player";
import { VideoSeekBar } from "@/components/kit/video-seek-bar";
import { chapterTime, type ShowChapter } from "@/src/lib/show-chapters";
import { chapterAt, PLAYER_RATES, playerKeyAction } from "@/src/lib/video-player";
import { cn } from "@/src/lib/utils";

type VideoPlayerProps = {
  src: string;
  /** Accessible name of the video. */
  label: string;
  poster?: string | null;
  preload?: "none" | "metadata" | "auto";
  /** Chapter marks on the seek bar and the current chapter's name beside the time. */
  chapters?: ShowChapter[];
  /** Frame classes (size, border, radius). The frame is always a black 16:9 box. */
  className?: string;
  ref?: Ref<HTMLVideoElement>;
  onError?: (event: SyntheticEvent<HTMLVideoElement>) => void;
  onLoadedMetadata?: (event: SyntheticEvent<HTMLVideoElement>) => void;
};

const CONTROL_BUTTON =
  "grid h-8 w-8 shrink-0 place-items-center rounded-md text-soft-white/85 transition-colors hover:bg-soft-white/10 hover:text-soft-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)] pointer-coarse:h-10 pointer-coarse:w-10 [&_svg]:h-[18px] [&_svg]:w-[18px]";

/**
 * The Portal's video player (everywhere except the review page, which has its own timeline). A flat InFocus
 * plate over the picture: green progress, chapter marks, Geist Mono time, speed, picture in picture and full
 * screen. Controls fade out while playing and come back on pointer movement or a key. Keys (once the player
 * has focus): Space/K play, J/L ±10 s, arrows ±5 s and volume, M mute, F full screen, 0–9 jump.
 */
export function VideoPlayer({
  src, label, poster, preload = "metadata", chapters = [], className, ref, onError, onLoadedMetadata
}: VideoPlayerProps) {
  const { video, frame, ...player } = useVideoPlayer(ref);
  const [menuOpen, setMenuOpen] = useState(false);
  const pointerType = useRef("mouse");
  const showControls = !player.playing || player.active || menuOpen;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey || menuOpen) return;
    const target = event.target as HTMLElement;
    if (target.tagName === "BUTTON" && (event.key === " " || event.key === "Enter")) return;
    if (target.dataset.nativeKeys !== undefined && event.key.startsWith("Arrow")) return;
    const action = playerKeyAction(event.key);
    if (!action) return;
    event.preventDefault();
    player.poke();
    const element = video.current;
    if (action.kind === "toggle") player.toggle();
    else if (action.kind === "seekBy") player.seek((element?.currentTime ?? 0) + action.seconds);
    else if (action.kind === "seekToFraction") player.seek(player.duration * action.fraction);
    else if (action.kind === "volumeBy") player.setVolume((element?.muted ? 0 : player.volume) + action.delta);
    else if (action.kind === "mute") player.toggleMute();
    else player.toggleFullscreen();
  }

  function onVideoClick() {
    // On touch, the first tap only brings the controls back.
    if (pointerType.current === "touch" && !showControls) {
      player.poke();
      return;
    }
    player.toggle();
  }

  return (
    <div
      ref={frame}
      tabIndex={0}
      role="group"
      aria-label={`${label} player`}
      onKeyDown={onKeyDown}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") player.poke();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") player.rest();
      }}
      onFocus={player.poke}
      className={cn(
        "group/player relative aspect-video w-full overflow-hidden bg-black text-soft-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]",
        !showControls && "cursor-none",
        className,
        player.fullscreen && "aspect-auto h-full max-h-none max-w-none rounded-none border-0"
      )}
    >
      <video
        ref={video}
        src={src}
        poster={poster ?? undefined}
        preload={preload}
        playsInline
        aria-label={label}
        onPointerDown={(event) => {
          pointerType.current = event.pointerType;
        }}
        onClick={onVideoClick}
        onDoubleClick={player.toggleFullscreen}
        onError={(event) => {
          player.markFailed();
          onError?.(event);
        }}
        onLoadedMetadata={onLoadedMetadata}
        {...player.videoEvents}
        className="absolute inset-0 h-full w-full bg-black object-contain"
      />
      <CenterMark player={player} />
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-black/70 px-2 pb-1.5 pt-1 transition-opacity duration-200 sm:px-3",
          showControls ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <VideoSeekBar time={player.time} duration={player.duration} buffered={player.buffered} chapters={chapters} onSeek={player.seek} />
        <ControlRow player={player} chapters={chapters} menuOpen={menuOpen} onMenuOpenChange={setMenuOpen} />
      </div>
    </div>
  );
}

/** Big middle mark: Play (or Replay) while stopped, a spinner while loading, a note when it can't play. */
function CenterMark({ player }: { player: VideoPlayerState }) {
  if (player.failed) {
    return (
      <div role="status" className="pointer-events-none absolute inset-0 grid place-items-center bg-black/70 p-4 text-center text-sm">
        <span className="inline-flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--brand-amber)]" aria-hidden />
          This video can&apos;t play right now.
        </span>
      </div>
    );
  }
  if (player.waiting && player.playing) {
    return (
      <div role="status" aria-label="Loading video" className={cn(PLATE, "pointer-events-none")}>
        <Loader2 className="h-7 w-7 motion-safe:animate-spin" aria-hidden />
      </div>
    );
  }
  if (player.playing) return null;
  return (
    <button
      type="button"
      aria-label={player.ended ? "Replay" : "Play"}
      onClick={player.toggle}
      className={cn(PLATE, "border-b-[3px] border-primary transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]")}
    >
      {player.ended ? <RotateCcw className="h-7 w-7" aria-hidden /> : <Play className="ml-0.5 h-7 w-7 fill-current" aria-hidden />}
    </button>
  );
}

// A square plate with the lower-third's green strip under it (DESIGN.md: plates are square).
const PLATE = "absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center bg-black/65 text-soft-white";

function ControlRow({ player, chapters, menuOpen, onMenuOpenChange }: {
  player: VideoPlayerState; chapters: ShowChapter[]; menuOpen: boolean; onMenuOpenChange: (open: boolean) => void;
}) {
  const chapter = chapters.length > 1 ? chapterAt(chapters, player.time) : null;
  const silent = player.muted || player.volume === 0;
  const VolumeIcon = silent ? VolumeX : player.volume < 0.5 ? Volume1 : Volume2;
  return (
    <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
      <ControlButton label={player.playing ? "Pause" : "Play"} hint="K" onClick={player.toggle}>
        {player.playing ? <Pause className="fill-current" aria-hidden /> : <Play className="fill-current" aria-hidden />}
      </ControlButton>
      <ControlButton label="Back 10 seconds" hint="J" className="max-sm:hidden" onClick={() => player.seek(player.time - 10)}>
        <RotateCcw aria-hidden />
      </ControlButton>
      <ControlButton label="Forward 10 seconds" hint="L" className="max-sm:hidden" onClick={() => player.seek(player.time + 10)}>
        <RotateCw aria-hidden />
      </ControlButton>
      <div className="group/volume flex items-center">
        <ControlButton label={silent ? "Unmute" : "Mute"} hint="M" onClick={player.toggleMute}>
          <VolumeIcon aria-hidden />
        </ControlButton>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={silent ? 0 : player.volume}
          onChange={(event) => player.setVolume(Number(event.target.value))}
          aria-label="Volume"
          data-native-keys=""
          className="h-1 w-0 cursor-pointer accent-[var(--soft-white)] opacity-0 transition-[width,opacity,margin] duration-200 focus-visible:w-16 focus-visible:opacity-100 group-hover/volume:mx-1 group-hover/volume:w-16 group-hover/volume:opacity-100 pointer-coarse:hidden"
        />
      </div>
      <span className="ml-1 flex min-w-0 items-baseline gap-2 text-[13px]">
        <span className="whitespace-nowrap font-mono-broadcast tabular-nums">
          {chapterTime(player.time)}
          {player.duration > 0 ? <span className="text-soft-white/60"> / {chapterTime(player.duration)}</span> : null}
        </span>
        {chapter ? <span className="truncate text-soft-white/75 max-sm:hidden">{chapter.title}</span> : null}
      </span>
      <span className="flex-1" />
      <RateMenu rate={player.rate} open={menuOpen} onOpenChange={onMenuOpenChange} onPick={player.setRate} />
      {player.canPip ? (
        <ControlButton label="Picture in picture" className="max-sm:hidden" onClick={player.togglePip}>
          <PictureInPicture2 aria-hidden />
        </ControlButton>
      ) : null}
      <ControlButton label={player.fullscreen ? "Exit full screen" : "Full screen"} hint="F" onClick={player.toggleFullscreen}>
        {player.fullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
      </ControlButton>
    </div>
  );
}

function ControlButton({ label, hint, className, onClick, children }: {
  label: string; hint?: string; className?: string; onClick: () => void; children: ReactNode;
}) {
  return (
    <button type="button" aria-label={label} title={hint ? `${label} (${hint})` : label} onClick={onClick} className={cn(CONTROL_BUTTON, className)}>
      {children}
    </button>
  );
}

/**
 * Speed picker. It draws inside the player rather than in a portal, so it still shows in full screen
 * (a portal lands outside the full-screen element).
 */
function RateMenu({ rate, open, onOpenChange, onPick }: {
  rate: number; open: boolean; onOpenChange: (open: boolean) => void; onPick: (rate: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open, onOpenChange]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Playback speed"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Playback speed"
        onClick={() => onOpenChange(!open)}
        className={cn(CONTROL_BUTTON, "w-auto min-w-8 px-1.5 font-mono-broadcast text-[12px] tabular-nums")}
      >
        {rate}x
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Playback speed"
          onKeyDown={(event) => {
            if (event.key === "Escape") onOpenChange(false);
          }}
          className="absolute bottom-full right-0 mb-2 min-w-24 rounded-md border border-soft-white/15 bg-black/90 p-1"
        >
          {PLAYER_RATES.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={option === rate}
              autoFocus={option === rate}
              onClick={() => {
                onPick(option);
                onOpenChange(false);
              }}
              className={cn(
                "flex h-8 w-full items-center justify-between gap-3 rounded-md px-2 font-mono-broadcast text-[13px] tabular-nums text-soft-white/85 hover:bg-soft-white/10 hover:text-soft-white focus-visible:bg-soft-white/10 focus-visible:outline-none pointer-coarse:h-10",
                option === rate && "text-soft-white"
              )}
            >
              {option === 1 ? "Normal" : `${option}x`}
              {option === rate ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--brand-green)]" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
