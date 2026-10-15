"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useRememberedState } from "@/components/kit/remembered-state";
import { createValueStore } from "@/components/review-playhead";
import { clampToDuration } from "@/components/review/comment-utils";
import { DEFAULT_REVIEW_FPS } from "@/src/lib/timecode";
import { bufferedSpans, sameBufferedSpans, type BufferedSpan } from "@/src/lib/video-buffer";

export const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2];

function isPlaybackRate(value: unknown): value is number {
  return typeof value === "number" && PLAYBACK_RATES.includes(value);
}

function isVolume(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

const VOLUME_SAVE_DELAY_MS = 300;

export type ReviewPlayback = ReturnType<typeof useReviewPlayback>;

/**
 * The review player's state: play/pause, duration, buffering, and the playhead and downloaded
 * ranges (kept in small stores so only the scrubber and timecodes re-render during playback).
 * One seek runs at a time; while the browser fetches, only the latest scrub target is kept.
 * Volume and speed are remembered per browser.
 */
export function useReviewPlayback({
  videoRef,
  versionId,
  isImageReview,
  hasVideo
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  versionId: string;
  isImageReview: boolean;
  /** The <video> is on the page (a ready version with a playback URL). */
  hasVideo: boolean;
}) {
  const pendingSeekRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playheadStore] = useState(() => createValueStore(0));
  const [bufferedStore] = useState(() => createValueStore<BufferedSpan[]>([]));
  const [rememberedVolume, rememberVolume] = useRememberedState<number>("review:volume:v1", 1, isVolume);
  // Dragging the slider updates this right away; it's saved once the slider rests.
  const [draftVolume, setDraftVolume] = useState<number | null>(null);
  const volume = draftVolume ?? rememberedVolume;
  const [playbackRate, setPlaybackRate] = useRememberedState<number>("review:speed:v1", 1, isPlaybackRate);

  useEffect(() => {
    if (isImageReview) {
      playheadStore.set(0);
      setDuration(0);
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    pendingSeekRef.current = null;
    bufferedStore.set([]);
    setIsBuffering(false);
    setIsPlaying(!video.paused);

    const syncBuffered = () => {
      const next = bufferedSpans(video.buffered, video.duration);
      if (!sameBufferedSpans(bufferedStore.get(), next)) {
        bufferedStore.set(next);
      }
    };

    const syncState = () => {
      // Keep the scrubber where the user dropped it while a queued seek is still waiting.
      if (pendingSeekRef.current === null) {
        playheadStore.set(video.currentTime || 0);
      }
      setDuration(video.duration || 0);
      syncBuffered();
    };

    // Short delay so quick in-buffer seeks don't flash the spinner.
    let bufferingTimer: number | undefined;
    const startBuffering = () => {
      window.clearTimeout(bufferingTimer);
      bufferingTimer = window.setTimeout(() => setIsBuffering(true), 200);
    };
    const stopBuffering = () => {
      window.clearTimeout(bufferingTimer);
      setIsBuffering(false);
    };

    const onSeeked = () => {
      const pending = pendingSeekRef.current;
      if (pending !== null) {
        pendingSeekRef.current = null;
        video.currentTime = pending;
        return;
      }
      if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA || video.paused) {
        stopBuffering();
      }
      syncState();
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    const listeners: Array<[keyof HTMLMediaElementEventMap, () => void]> = [
      ["loadedmetadata", syncState],
      ["durationchange", syncState],
      ["timeupdate", syncState],
      ["progress", syncBuffered],
      ["play", onPlay],
      ["pause", onPause],
      ["waiting", startBuffering],
      ["seeking", startBuffering],
      ["seeked", onSeeked],
      ["playing", stopBuffering],
      ["canplay", stopBuffering],
      ["error", stopBuffering],
      ["emptied", stopBuffering]
    ];
    listeners.forEach(([type, handler]) => video.addEventListener(type, handler));

    return () => {
      window.clearTimeout(bufferingTimer);
      listeners.forEach(([type, handler]) => video.removeEventListener(type, handler));
    };
  }, [versionId, isImageReview, hasVideo, playheadStore, bufferedStore, videoRef]);

  useEffect(() => {
    if (isImageReview) {
      return;
    }
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.playbackRate = playbackRate;
    video.volume = volume;
    if (volume === 0) {
      video.muted = true;
    } else if (video.muted) {
      video.muted = false;
    }
  }, [isImageReview, volume, playbackRate, versionId, hasVideo, videoRef]);

  useEffect(() => {
    if (draftVolume === null) {
      return;
    }
    const timer = window.setTimeout(() => {
      rememberVolume(draftVolume);
      setDraftVolume(null);
    }, VOLUME_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draftVolume, rememberVolume]);

  const seekTo = useCallback(
    (timeSeconds: number) => {
      const video = videoRef.current;
      if (!video) {
        return;
      }
      const nextTime = clampToDuration(timeSeconds, video.duration || duration);
      playheadStore.set(nextTime);
      if (video.seeking) {
        pendingSeekRef.current = nextTime;
        return;
      }
      video.currentTime = nextTime;
    },
    [duration, playheadStore, videoRef]
  );

  const seekBy = useCallback((deltaSeconds: number) => seekTo(playheadStore.get() + deltaSeconds), [playheadStore, seekTo]);

  /** One frame (1/30 s) back or forward; only while paused. */
  const stepFrame = useCallback(
    (direction: 1 | -1) => {
      const video = videoRef.current;
      if (!video || !video.paused) {
        return;
      }
      seekTo(playheadStore.get() + direction / DEFAULT_REVIEW_FPS);
    },
    [playheadStore, seekTo, videoRef]
  );

  const togglePlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (video.paused) {
      // A blocked play() (autoplay rules, a source that failed) just leaves the video paused.
      await video.play().catch(() => undefined);
      return;
    }
    video.pause();
  }, [videoRef]);

  return {
    isPlaying,
    duration,
    isBuffering,
    playheadStore,
    bufferedStore,
    volume,
    setVolume: setDraftVolume,
    playbackRate,
    setPlaybackRate,
    seekTo,
    seekBy,
    stepFrame,
    togglePlayback
  };
}
