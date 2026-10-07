"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import type { MeetingClientMessage, MeetingWatchState } from "@/src/lib/meetings/protocol";
import type { MeetingCut } from "@/src/lib/meetings/types";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";
import { diagEvent } from "@/src/lib/meetings/client/diagnostics";
import { watchNotice } from "@/src/lib/meetings/client/watch-sync";

type CutLoad = { versionId: string; cut: MeetingCut | null; error: string | null };

export type WatchParty = {
  watch: MeetingWatchState | null;
  /** Title and playback URL of the cut being watched (null while loading or failed). */
  cut: MeetingCut | null;
  error: string | null;
  /** Fetch a fresh playback URL (it expires after about 30 minutes, and a load can fail). */
  reload: () => void;
  /** Our estimate of the room clock (epoch ms). */
  serverNow: () => number;
  start: (mediaId: string, versionId: string) => void;
  play: (position: number) => void;
  pause: (position: number) => void;
  seek: (position: number) => void;
  stop: () => void;
  /**
   * The cut ran out on this device. The room still says "playing" (which keeps the Scribe from
   * taking notes), so whoever made the last change pauses it at the end.
   */
  finish: (position: number) => void;
  /** This device's volume and mute: kept here so they survive the tile moving on the stage. */
  volume: number;
  muted: boolean;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
};

const OFFLINE = "You're offline. Try again in a moment.";

/** Watch together state for the call: the cut's details, notices, and the controls everyone shares. */
export function useWatchParty(input: {
  watch: MeetingWatchState | null;
  selfUid: string | null;
  send: (message: MeetingClientMessage) => boolean;
  serverOffset: RefObject<number>;
}): WatchParty {
  const { watch, selfUid, send, serverOffset } = input;
  const versionId = watch?.versionId ?? null;
  const [load, setLoad] = useState<CutLoad | null>(null);
  const [reloads, setReloads] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!versionId) return;
    let cancelled = false;
    meetingsApi
      .cut(versionId)
      .then((cut) => {
        if (!cancelled) setLoad({ versionId, cut, error: null });
      })
      .catch((error: unknown) => {
        diagEvent("watch_cut_failed", { message: errorMessage(error) });
        if (!cancelled) setLoad({ versionId, cut: null, error: errorMessage(error, "Couldn't load this video.") });
      });
    return () => {
      cancelled = true;
    };
  }, [versionId, reloads]);

  const current = load && load.versionId === versionId ? load : null;
  const duration = current?.cut?.durationSeconds ?? null;

  // "Paused by Sage at 1:02": other people's changes only.
  const previous = useRef<MeetingWatchState | null>(watch);
  useEffect(() => {
    const notice = watchNotice(previous.current, watch, selfUid, duration);
    previous.current = watch;
    if (notice) toast(notice);
  }, [watch, selfUid, duration]);

  const control = useCallback(
    (message: MeetingClientMessage) => {
      if (!send(message)) toast.error(OFFLINE);
    },
    [send]
  );
  const id = watch?.id ?? null;
  const timed = useCallback(
    (action: "play" | "pause" | "seek", position: number) => {
      if (id) control({ t: "watch", action, id, position: Math.max(0, position) });
    },
    [control, id]
  );
  const finishing = Boolean(watch?.playing && watch.by === selfUid);

  return {
    watch,
    cut: current?.cut ?? null,
    error: current?.error ?? null,
    reload: useCallback(() => setReloads((n) => n + 1), []),
    serverNow: useCallback(() => Date.now() + (serverOffset.current ?? 0), [serverOffset]),
    start: useCallback((mediaId: string, nextVersionId: string) => control({ t: "watch", action: "start", mediaId, versionId: nextVersionId }), [control]),
    play: useCallback((position: number) => timed("play", position), [timed]),
    pause: useCallback((position: number) => timed("pause", position), [timed]),
    seek: useCallback((position: number) => timed("seek", position), [timed]),
    stop: useCallback(() => {
      if (id) control({ t: "watch", action: "stop", id });
    }, [control, id]),
    finish: useCallback(
      (position: number) => {
        if (finishing) timed("pause", position);
      },
      [finishing, timed]
    ),
    volume,
    muted,
    setVolume,
    setMuted
  };
}
