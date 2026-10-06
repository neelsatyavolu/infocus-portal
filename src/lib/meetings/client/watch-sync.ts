import type { MeetingWatchState } from "@/src/lib/meetings/protocol";

/**
 * Watch together timing. Every device plays the cut itself; the room holds where it should be
 * (`position` at room time `at`). `serverNow` is our estimate of the room clock:
 * Date.now() + offset, where offset = the room's `now` minus Date.now() when its message arrived.
 */

/** Farther off than this (seconds): jump straight to the right spot. */
export const WATCH_SEEK_DRIFT_S = 1;
/** Closer than this: leave it alone. In between, play slightly faster or slower until caught up. */
export const WATCH_NUDGE_DRIFT_S = 0.15;
export const WATCH_NUDGE_RATE = 0.05;
/** While paused the picture should match exactly (everyone is looking at the same frame). */
const PAUSED_DRIFT_S = 0.05;
/** How close to the end counts as finished (no more playing). */
const END_SLACK_S = 0.05;

/** Where the video should be now (seconds, at least 0). Before a start's lead runs out, that's its start position. */
export function watchTargetPosition(watch: MeetingWatchState, serverNow: number): number {
  const elapsed = watch.playing ? Math.max(0, serverNow - watch.at) / 1000 : 0;
  return Math.max(0, watch.position + elapsed);
}

/** A start is counting down: everyone holds at the first frame until `at`. */
export function watchCountingDown(watch: MeetingWatchState, serverNow: number): boolean {
  return watch.playing && serverNow < watch.at;
}

export type WatchCorrection = {
  /** Seek here first (null: stay). */
  seekTo: number | null;
  /** Whether the element should be playing. */
  play: boolean;
  playbackRate: number;
};

/**
 * What to do with the local element to match the room. `duration` is the element's (NaN or
 * Infinity until known). Past the end the video simply stays on its last frame.
 */
export function watchCorrection(input: {
  watch: MeetingWatchState;
  serverNow: number;
  current: number;
  duration: number;
}): WatchCorrection {
  const { watch, serverNow, current, duration } = input;
  const known = Number.isFinite(duration) && duration > 0;
  const target = known ? Math.min(watchTargetPosition(watch, serverNow), duration) : watchTargetPosition(watch, serverNow);
  const ended = known && target >= duration - END_SLACK_S;
  const play = watch.playing && !watchCountingDown(watch, serverNow) && !ended;
  const drift = current - target;

  if (!play) {
    return { seekTo: Math.abs(drift) > PAUSED_DRIFT_S ? target : null, play: false, playbackRate: 1 };
  }
  if (Math.abs(drift) > WATCH_SEEK_DRIFT_S) return { seekTo: target, play: true, playbackRate: 1 };
  if (Math.abs(drift) > WATCH_NUDGE_DRIFT_S) {
    return { seekTo: null, play: true, playbackRate: drift > 0 ? 1 - WATCH_NUDGE_RATE : 1 + WATCH_NUDGE_RATE };
  }
  return { seekTo: null, play: true, playbackRate: 1 };
}

/** "1:02", "12:30", "1:00:05". */
export function formatWatchTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/**
 * A short notice when someone else changes the watch ("Paused by Sage at 1:02"); null for our
 * own changes and for nothing new. `prev` and `next` are consecutive room states.
 */
export function watchNotice(prev: MeetingWatchState | null, next: MeetingWatchState | null, selfUid: string | null): string | null {
  if (!next) return prev ? "Watch together ended." : null;
  if (next.by === selfUid) return null;
  if (prev && prev.id === next.id && prev.at === next.at && prev.action === next.action) return null;
  switch (next.action) {
    case "start":
      return prev?.id === next.id ? null : `${next.byName} started watching together.`;
    case "pause":
      return `Paused by ${next.byName} at ${formatWatchTime(next.position)}.`;
    case "play":
      return `${next.byName} pressed play.`;
    case "seek":
      return `${next.byName} jumped to ${formatWatchTime(next.position)}.`;
  }
}
