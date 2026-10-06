"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Clapperboard, Loader2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { diagEvent, errorText } from "@/src/lib/meetings/client/diagnostics";
import { watchCountingDown } from "@/src/lib/meetings/client/watch-sync";
import { cn } from "@/src/lib/utils";
import type { WatchParty } from "./use-watch-party";
import { useWatchSync } from "./use-watch-sync";
import { WatchControls } from "./watch-controls";

/** Scrubbing sends one seek once the thumb rests this long (dragging would flood the room). */
const SCRUB_COMMIT_MS = 250;
/** A failed load fetches a fresh playback URL at most this often (URLs expire after ~30 minutes). */
const RELOAD_EVERY_MS = 30_000;

type VideoWithSink = HTMLVideoElement & {
  sinkId?: string;
  setSinkId?: (id: string) => Promise<void>;
  webkitEnterFullscreen?: () => void;
};

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0F110F]/70 p-4 text-center text-sm text-[var(--soft-white)]">
      {children}
    </div>
  );
}

/**
 * The watch-together player on the stage. Everyone plays the same cut on their own device, kept
 * in step by the room; play, pause, seek and stop are shared, volume is just this device.
 */
export function WatchTile({
  party,
  placement,
  sinkId,
  onChange
}: {
  party: WatchParty;
  placement: "main" | "grid" | "strip";
  sinkId: string;
  onChange: () => void;
}) {
  const { watch, cut, error, volume, muted, setVolume, setMuted } = party;
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const holdRef = useRef(false);
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReload = useRef(0);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(cut?.durationSeconds ?? Number.NaN);
  const [scrub, setScrub] = useState<number | null>(null);
  const [buffering, setBuffering] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const src = cut?.playbackUrl ?? null;
  const { needsSound, enableSound, holdUntilEcho } = useWatchSync({ videoRef, watch, src, serverNow: party.serverNow, holdRef });
  const small = placement === "strip";

  useEffect(() => () => {
    if (scrubTimer.current) clearTimeout(scrubTimer.current);
  }, []);

  useEffect(() => {
    const el = videoRef.current as VideoWithSink | null;
    if (!el?.setSinkId || (el.sinkId ?? "") === sinkId) return;
    void el.setSinkId(sinkId).catch((err: unknown) => diagEvent("watch_sink_failed", { message: errorText(err) }));
  }, [sinkId, src]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = volume;
    el.muted = muted;
  }, [volume, muted, src]);

  if (!watch) return null;
  const countingDown = watchCountingDown(watch, party.serverNow());
  // The room still says "playing" once the video runs out; show Play, and play again from the top.
  const ended = Number.isFinite(duration) && duration > 0 && time >= duration - 0.25;
  const playing = watch.playing && !ended;

  const onVideoError = () => {
    const now = Date.now();
    if (now - lastReload.current > RELOAD_EVERY_MS) {
      lastReload.current = now;
      party.reload();
      return;
    }
    setLoadFailed(true);
  };

  const scrubTo = (seconds: number) => {
    holdRef.current = true;
    setScrub(seconds);
    if (scrubTimer.current) clearTimeout(scrubTimer.current);
    scrubTimer.current = setTimeout(() => {
      const el = videoRef.current;
      if (el) el.currentTime = seconds;
      party.seek(seconds);
      holdUntilEcho();
      holdRef.current = false;
      setScrub(null);
    }, SCRUB_COMMIT_MS);
  };

  const playPause = () => {
    const el = videoRef.current;
    const position = el?.currentTime ?? 0;
    if (playing) {
      el?.pause();
      party.pause(position);
      holdUntilEcho();
    } else {
      party.play(ended ? 0 : position);
    }
  };

  const fullscreen = () => {
    const container = containerRef.current;
    const el = videoRef.current as VideoWithSink | null;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else if (container?.requestFullscreen) void container.requestFullscreen().catch(() => undefined);
    else el?.webkitEnterFullscreen?.();
  };

  return (
    <div
      ref={containerRef}
      aria-label={cut ? `Watching together: ${cut.topic}, ${cut.label}` : "Watching together"}
      className="group relative h-full w-full overflow-hidden rounded-md bg-black outline outline-1 outline-[var(--ink-4)]"
    >
      {src ? (
        <video
          key={src}
          ref={videoRef}
          src={src}
          playsInline
          preload="auto"
          className="h-full w-full object-contain"
          onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
          onDurationChange={(event) => setDuration(event.currentTarget.duration)}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => {
            setBuffering(false);
            setLoadFailed(false);
          }}
          onError={onVideoError}
        />
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-[#0F110F]/80 to-transparent px-3 pb-6 pt-2 text-[var(--soft-white)]">
        <Clapperboard className="h-4 w-4 shrink-0" aria-hidden />
        <span className={cn("truncate font-medium", small ? "text-xs" : "text-sm")}>
          {cut ? `${cut.topic} · ${cut.label}` : "Watch together"}
        </span>
        {cut && !small ? <span className="shrink-0 font-mono text-xs text-[var(--soft-white)]/70">Cycle {cut.cycleNumber}</span> : null}
      </div>

      {error || loadFailed ? (
        <Note>
          <span>{error ?? "Couldn't play this video."}</span>
          {!small ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setLoadFailed(false);
                party.reload();
              }}
            >
              Try again
            </Button>
          ) : null}
        </Note>
      ) : !cut ? (
        <Note>
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          {!small ? <span>Loading the video…</span> : null}
        </Note>
      ) : countingDown ? (
        <Note>{small ? "Starting…" : `${watch.byName} started it. Starting…`}</Note>
      ) : buffering ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--soft-white)]" aria-label="Loading" />
        </div>
      ) : null}

      {needsSound && !small ? (
        <Button size="sm" className="absolute left-1/2 top-12 -translate-x-1/2" onClick={enableSound}>
          <Volume2 className="h-4 w-4" aria-hidden /> Tap for sound
        </Button>
      ) : null}

      {cut && !small ? (
        <WatchControls
          playing={playing}
          time={scrub ?? time}
          duration={duration}
          volume={volume}
          muted={muted}
          compact={placement !== "main"}
          onPlayPause={playPause}
          onScrub={scrubTo}
          onVolume={(next) => {
            setVolume(next);
            setMuted(next === 0);
          }}
          onMute={() => setMuted(!muted)}
          onFullscreen={fullscreen}
          onChange={onChange}
          onStop={party.stop}
        />
      ) : null}
    </div>
  );
}
