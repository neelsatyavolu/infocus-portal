"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore, type Ref } from "react";
import { bufferedSpans, sameBufferedSpans, type BufferedSpan } from "@/src/lib/video-buffer";
import { clampTime } from "@/src/lib/video-player";

const noSubscribe = () => () => undefined;

/** How long the controls stay up after the pointer stops moving over a playing video. */
const IDLE_HIDE_MS = 2500;

type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

/**
 * State and actions for the shared `VideoPlayer`: mirrors the <video> element's events into React state,
 * runs the playhead on animation frames while playing (so the seek bar moves smoothly), and decides when
 * the controls hide. `ref` is the caller's handle on the same <video>. The refs come back beside the state
 * so the component can hand the state to its children without passing refs around in render.
 */
export function useVideoPlayer(ref: Ref<HTMLVideoElement> | undefined) {
  const video = useRef<HTMLVideoElement | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState<BufferedSpan[]>([]);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRateState] = useState(1);
  const [active, setActive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const canPip = useSyncExternalStore(noSubscribe, () => document.pictureInPictureEnabled === true, () => false);

  useImperativeHandle(ref, () => video.current as HTMLVideoElement, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frame.current && frame.current !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      clearTimeout(idleTimer.current);
    };
  }, []);

  // Smooth playhead while playing; `timeupdate` alone moves it about four times a second.
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    const tick = () => {
      if (video.current) setTime(video.current.currentTime);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing]);

  const poke = useCallback(() => {
    setActive(true);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setActive(false), IDLE_HIDE_MS);
  }, []);

  const rest = useCallback(() => {
    clearTimeout(idleTimer.current);
    setActive(false);
  }, []);

  const toggle = useCallback(() => {
    const element = video.current;
    if (!element) return;
    if (element.paused || element.ended) void element.play().catch(() => undefined);
    else element.pause();
  }, []);

  const seek = useCallback((to: number) => {
    const element = video.current;
    if (!element) return;
    const next = clampTime(to, element.duration);
    element.currentTime = next;
    setTime(next);
  }, []);

  const setVolume = useCallback((next: number) => {
    const element = video.current;
    if (!element) return;
    element.volume = Math.max(0, Math.min(1, next));
    element.muted = element.volume === 0;
  }, []);

  const toggleMute = useCallback(() => {
    const element = video.current;
    if (!element) return;
    if (element.muted && element.volume === 0) element.volume = 0.5;
    element.muted = !element.muted;
  }, []);

  const setRate = useCallback((next: number) => {
    if (video.current) video.current.playbackRate = next;
  }, []);

  const toggleFullscreen = useCallback(() => {
    const element = video.current as WebkitVideo | null;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else if (frame.current?.requestFullscreen) {
      void frame.current.requestFullscreen().catch(() => undefined);
    } else {
      element?.webkitEnterFullscreen?.(); // iPhone Safari: only the <video> itself can go full screen.
    }
  }, []);

  const togglePip = useCallback(() => {
    const element = video.current;
    if (!element) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
    else void element.requestPictureInPicture().catch(() => undefined);
  }, []);

  const syncBuffered = useCallback(() => {
    const element = video.current;
    if (!element) return;
    const next = bufferedSpans(element.buffered, element.duration);
    setBuffered((current) => (sameBufferedSpans(current, next) ? current : next));
  }, []);

  /** Event props to spread on the <video>. */
  const videoEvents = {
    onPlay: () => {
      setPlaying(true);
      setEnded(false);
      poke();
    },
    onPause: () => setPlaying(false),
    onEnded: () => {
      setPlaying(false);
      setEnded(true);
    },
    onWaiting: () => setWaiting(true),
    onPlaying: () => setWaiting(false),
    onCanPlay: () => setWaiting(false),
    onLoadStart: () => {
      setFailed(false);
      setBuffered([]);
    },
    onTimeUpdate: (event: { currentTarget: HTMLVideoElement }) => setTime(event.currentTarget.currentTime),
    onDurationChange: (event: { currentTarget: HTMLVideoElement }) => {
      const value = event.currentTarget.duration;
      setDuration(Number.isFinite(value) ? value : 0);
    },
    onProgress: syncBuffered,
    onVolumeChange: (event: { currentTarget: HTMLVideoElement }) => {
      setVolumeState(event.currentTarget.volume);
      setMuted(event.currentTarget.muted);
    },
    onRateChange: (event: { currentTarget: HTMLVideoElement }) => setRateState(event.currentTarget.playbackRate)
  };

  const markFailed = useCallback(() => {
    setFailed(true);
    setWaiting(false);
  }, []);

  return {
    video, frame, videoEvents, markFailed,
    playing, ended, waiting, failed, time, duration, buffered, volume, muted, rate, active, fullscreen, canPip,
    poke, rest, toggle, seek, setVolume, toggleMute, setRate, toggleFullscreen, togglePip
  };
}

export type VideoPlayerState = Omit<ReturnType<typeof useVideoPlayer>, "video" | "frame">;
