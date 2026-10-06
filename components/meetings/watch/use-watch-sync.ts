"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { diagEvent, errorText } from "@/src/lib/meetings/client/diagnostics";
import { watchCorrection } from "@/src/lib/meetings/client/watch-sync";
import type { MeetingWatchState } from "@/src/lib/meetings/protocol";

const TICK_MS = 500;
/** A stalled device would otherwise seek every tick and never finish buffering. */
const SEEK_COOLDOWN_MS = 3000;
/** After our own pause or seek, wait this long at most for the room's echo (a send can fail). */
const ECHO_WAIT_MS = 2000;

/**
 * Keeps one <video> in step with the room: every tick it seeks, nudges the rate, plays or pauses
 * (watchCorrection). While `holdRef` is set (the person is dragging the scrubber) it leaves the
 * element alone. If the browser blocks playback with sound, it plays muted and reports `needsSound`.
 */
export function useWatchSync(input: {
  videoRef: RefObject<HTMLVideoElement | null>;
  watch: MeetingWatchState | null;
  src: string | null;
  serverNow: () => number;
  holdRef: RefObject<boolean>;
}) {
  const { videoRef, watch, src, serverNow, holdRef } = input;
  const [needsSound, setNeedsSound] = useState(false);
  const lastSeekAt = useRef(0);
  // Our own pause or seek already changed the element: until the room echoes it, the old room
  // state would undo it (play again, jump back).
  const awaitingEcho = useRef(false);
  const echoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !watch || !src) return;

    const play = () => {
      el.play().catch((error: unknown) => {
        if (!(error instanceof DOMException) || error.name !== "NotAllowedError" || el.muted) return;
        // Autoplay with sound blocked (iOS before a tap): keep in step muted and offer sound.
        diagEvent("watch_play_blocked", { message: errorText(error) });
        el.muted = true;
        setNeedsSound(true);
        void el.play().catch(() => undefined);
      });
    };

    const apply = () => {
      if (holdRef.current || awaitingEcho.current || el.readyState < HTMLMediaElement.HAVE_METADATA) return;
      const correction = watchCorrection({ watch, serverNow: serverNow(), current: el.currentTime, duration: el.duration });
      const now = Date.now();
      if (correction.seekTo !== null && !el.seeking && (!correction.play || now - lastSeekAt.current > SEEK_COOLDOWN_MS)) {
        lastSeekAt.current = now;
        el.currentTime = correction.seekTo;
      }
      if (el.playbackRate !== correction.playbackRate) el.playbackRate = correction.playbackRate;
      if (correction.play && el.paused) play();
      else if (!correction.play && !el.paused) el.pause();
    };

    // A change from the room (pause, seek, play) applies at once, not on the next tick.
    awaitingEcho.current = false;
    lastSeekAt.current = 0;
    apply();
    el.addEventListener("loadedmetadata", apply);
    const timer = setInterval(apply, TICK_MS);
    return () => {
      clearInterval(timer);
      el.removeEventListener("loadedmetadata", apply);
    };
  }, [videoRef, watch, src, serverNow, holdRef]);

  useEffect(
    () => () => {
      if (echoTimer.current) clearTimeout(echoTimer.current);
    },
    []
  );

  return {
    needsSound,
    /** Call right after a local pause or seek that was sent to the room. */
    holdUntilEcho: () => {
      awaitingEcho.current = true;
      if (echoTimer.current) clearTimeout(echoTimer.current);
      echoTimer.current = setTimeout(() => {
        awaitingEcho.current = false;
      }, ECHO_WAIT_MS);
    },
    /** Call from a tap: turn the sound on. */
    enableSound: () => {
      const el = videoRef.current;
      if (!el) return;
      el.muted = false;
      setNeedsSound(false);
      void el.play().catch(() => undefined);
    }
  };
}
