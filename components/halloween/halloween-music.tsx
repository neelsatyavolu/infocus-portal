"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Music, VolumeX } from "lucide-react";
import { readHalloweenPrefs, writeHalloweenPrefs } from "@/src/lib/halloween";
import { useHalloweenPrefs } from "@/src/lib/use-halloween";
import { startSpookyMusic, stopSpookyMusic } from "./spooky-music";
import { runningSpookyAudio, unlockSpookySounds } from "./spooky-sounds";

const MEDIA_EVENTS = ["play", "playing", "pause", "ended", "emptied", "volumechange"] as const;
const GESTURES = ["pointerdown", "keydown"] as const;

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

// Media events don't bubble, so listen in the capture phase for every player on the page.
function subscribeMedia(onChange: () => void) {
  MEDIA_EVENTS.forEach((name) => document.addEventListener(name, onChange, true));
  return () => MEDIA_EVENTS.forEach((name) => document.removeEventListener(name, onChange, true));
}

/** A video or audio player on the page is making sound (muted background videos don't count). */
export function mediaIsPlaying() {
  return Array.from(document.querySelectorAll<HTMLMediaElement>("video, audio")).some(
    (media) => !media.paused && !media.ended && !media.muted && media.volume > 0
  );
}

/**
 * Background music for the Halloween season, with a mute button beside the ✱ button. It starts on
 * the first click or key press (browsers block sound before that), and pauses while the tab is
 * hidden or another player on the page is playing, so it never talks over a package video.
 */
export function HalloweenMusic() {
  const { musicOff } = useHalloweenPrefs();
  const [ctx, setCtx] = useState<AudioContext | null>(() => runningSpookyAudio());
  const hidden = useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
  const mediaPlaying = useSyncExternalStore(subscribeMedia, mediaIsPlaying, () => false);
  const subscribeAudio = useCallback(
    (onChange: () => void) => {
      ctx?.addEventListener("statechange", onChange);
      return () => ctx?.removeEventListener("statechange", onChange);
    },
    [ctx]
  );
  const running = useSyncExternalStore(subscribeAudio, () => ctx?.state === "running", () => false);
  const playing = running && !musicOff && !hidden && !mediaPlaying;

  useEffect(() => {
    if (ctx) return;
    function unlock() {
      setCtx(unlockSpookySounds());
    }
    GESTURES.forEach((name) => window.addEventListener(name, unlock, true));
    return () => GESTURES.forEach((name) => window.removeEventListener(name, unlock, true));
  }, [ctx]);

  useEffect(() => {
    if (!playing || !ctx) return;
    startSpookyMusic(ctx);
    return () => stopSpookyMusic();
  }, [ctx, playing]);

  const label = musicOff ? "Play spooky music" : "Mute spooky music";
  return (
    <button
      type="button"
      className="hw-music hw-hit"
      data-playing={playing}
      onClick={() => writeHalloweenPrefs({ ...readHalloweenPrefs(), musicOff: !musicOff })}
      aria-label={label}
      title={label}
    >
      {musicOff ? <VolumeX aria-hidden /> : <Music aria-hidden />}
    </button>
  );
}
