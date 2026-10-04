"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { catchError, of, type Observable } from "rxjs";
import { withBackoff } from "@/src/lib/meetings/client/media-session";
import { useObservableAsValue, useValueAsObservable } from "partytracks/react";
import type { PartyTracks } from "partytracks/client";
import type { MeetingTrackMetadata } from "@/src/lib/meetings/protocol";
import type { SimulcastRid } from "@/src/lib/meetings/client/layout";
import type { MeetingE2ee } from "@/src/lib/meetings/client/e2ee";
import { watchTrackLevel } from "@/src/lib/meetings/client/audio-level";
import { cn } from "@/src/lib/utils";

const EMPTY: Observable<MediaStreamTrack> = of();

/** Pulls one remote track (re-pulls when its metadata changes). `rid` picks the simulcast layer. */
export function usePulledTrack(
  partyTracks: PartyTracks | null,
  meta: MeetingTrackMetadata | undefined,
  rid?: SimulcastRid
) {
  const metaKey = meta?.sessionId && meta.trackName ? `${meta.sessionId}/${meta.trackName}` : null;
  const rid$ = useValueAsObservable<string | undefined>(rid);
  const simulcast = rid !== undefined;
  const track$ = useMemo(() => {
    if (!partyTracks || !metaKey) return EMPTY;
    const [sessionId, ...rest] = metaKey.split("/");
    const trackData = of({ location: "remote" as const, sessionId, trackName: rest.join("/") });
    const pulled = simulcast ? partyTracks.pull(trackData, { simulcast: { preferredRid$: rid$ } }) : partyTracks.pull(trackData);
    return pulled.pipe(withBackoff(), catchError(() => EMPTY));
  }, [partyTracks, metaKey, simulcast, rid$]);
  return useObservableAsValue(track$);
}

export function useObservableTrack(track$: Observable<MediaStreamTrack> | null) {
  const stable = useMemo(() => track$ ?? EMPTY, [track$]);
  return useObservableAsValue(stable);
}

/** True while this pulled track keeps failing to decrypt (wrong or missing key). */
export function useDecryptFailing(e2ee: MeetingE2ee | null, track: MediaStreamTrack | undefined) {
  return useSyncExternalStore(
    (listener) => e2ee?.subscribe(listener) ?? (() => undefined),
    () => Boolean(e2ee && track && e2ee.isFailing(track.id)),
    () => false
  );
}

export function VideoView({
  track,
  mirror,
  contain,
  className
}: {
  track: MediaStreamTrack | undefined;
  mirror?: boolean;
  contain?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = track ? new MediaStream([track]) : null;
    if (track) void el.play().catch(() => undefined);
  }, [track]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={cn("h-full w-full", contain ? "object-contain" : "object-cover", mirror && "-scale-x-100", className)}
    />
  );
}

/**
 * Plays one participant's audio and reports its level for the active-speaker ring.
 * If autoplay is blocked (iOS before a tap), calls onBlocked so the UI can offer "Turn on sound".
 */
export function RemoteAudio({
  partyTracks,
  meta,
  uid,
  sinkId,
  onLevel,
  onBlocked
}: {
  partyTracks: PartyTracks | null;
  meta: MeetingTrackMetadata | undefined;
  uid: string;
  sinkId: string;
  onLevel: (uid: string, level: number) => void;
  onBlocked: () => void;
}) {
  const track = usePulledTrack(partyTracks, meta);
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    el.srcObject = new MediaStream([track]);
    el.play().catch(onBlocked);
    const stop = watchTrackLevel(track, (level) => onLevel(uid, level));
    return () => {
      stop();
      onLevel(uid, 0);
    };
  }, [track, uid, onLevel, onBlocked]);

  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (el?.setSinkId && sinkId) void el.setSinkId(sinkId).catch(() => undefined);
  }, [sinkId, track]);

  return <audio ref={ref} autoPlay data-meet-audio="" className="hidden" />;
}

/** Retries playback on every remote audio element (call from a tap). */
export function unblockAllAudio() {
  document.querySelectorAll<HTMLAudioElement>("audio[data-meet-audio]").forEach((el) => {
    void el.play().catch(() => undefined);
  });
}
