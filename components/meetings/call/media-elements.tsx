"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { of, type Observable } from "rxjs";
import { pullRegistryFor } from "@/src/lib/meetings/client/media-session";
import { metaKeyOf, type PullHandle } from "@/src/lib/meetings/client/pull-registry";
import { useObservableAsValue } from "partytracks/react";
import type { PartyTracks } from "partytracks/client";
import type { MeetingTrackMetadata } from "@/src/lib/meetings/protocol";
import type { SimulcastRid } from "@/src/lib/meetings/client/layout";
import type { MeetingE2ee } from "@/src/lib/meetings/client/e2ee";
import { watchTrackLevel } from "@/src/lib/meetings/client/audio-level";
import { diagEvent, errorText, registerPulledTrack, unregisterPulledTrack } from "@/src/lib/meetings/client/diagnostics";
import { cn } from "@/src/lib/utils";

const EMPTY: Observable<MediaStreamTrack> = of();

/**
 * One remote track, through the media session's shared pull registry: every tile, the audio
 * element and layout switches reuse the same live pull (released 15 s after the last user).
 * `rid` is this consumer's wanted simulcast layer; the pull uses the highest any consumer wants.
 */
export function usePulledTrack(
  partyTracks: PartyTracks | null,
  meta: MeetingTrackMetadata | undefined,
  rid?: SimulcastRid
) {
  const metaKey = metaKeyOf(meta);
  const simulcast = rid !== undefined;
  const ridRef = useRef(rid);
  const [handle, setHandle] = useState<PullHandle | null>(null);

  useEffect(() => {
    const registry = partyTracks ? pullRegistryFor(partyTracks) : null;
    if (!registry || !metaKey) return;
    const next = registry.acquire(metaKey, simulcast, ridRef.current);
    setHandle(next);
    return () => {
      next.release();
      setHandle((current) => (current === next ? null : current));
    };
  }, [partyTracks, metaKey, simulcast]);

  useEffect(() => {
    ridRef.current = rid;
    if (handle && rid) handle.setRid(rid);
  }, [handle, rid]);

  const track$ = useMemo(() => handle?.track$ ?? EMPTY, [handle]);
  const track = useObservableAsValue(track$);
  // Lets diagnostics tell whose stream an inbound-rtp stat is.
  useEffect(() => {
    if (!track || !metaKey) return;
    const [sessionId, ...rest] = metaKey.split("/");
    registerPulledTrack(track.id, sessionId, rest.join("/"));
    return () => unregisterPulledTrack(track.id);
  }, [track, metaKey]);
  return track;
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
    el.play().catch((error: unknown) => {
      diagEvent("audio_play_rejected", { message: errorText(error) });
      onBlocked();
    });
    const stop = watchTrackLevel(track, (level) => onLevel(uid, level));
    return () => {
      stop();
      onLevel(uid, 0);
    };
  }, [track, uid, onLevel, onBlocked]);

  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { sinkId?: string; setSinkId?: (id: string) => Promise<void> }) | null;
    // "" is the system default: set it too, so an unplugged speaker doesn't keep playback on a dead device.
    if (!el?.setSinkId || (el.sinkId ?? "") === sinkId) return;
    void el.setSinkId(sinkId).catch((error: unknown) => diagEvent("sink_failed", { message: errorText(error) }));
  }, [sinkId, track]);

  return <audio ref={ref} autoPlay data-meet-audio="" className="hidden" />;
}

/** Retries playback on every remote audio element (call from a tap). */
export function unblockAllAudio() {
  document.querySelectorAll<HTMLAudioElement>("audio[data-meet-audio]").forEach((el) => {
    void el.play().catch(() => undefined);
  });
}
