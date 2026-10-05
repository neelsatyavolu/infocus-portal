"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { combineLatest, distinctUntilChanged, map, of } from "rxjs";
import { useValueAsObservable } from "partytracks/react";
import { toast } from "sonner";
import type { TrackMetadata } from "partytracks/client";
import type { MeetingClientMessage, MeetingTrackKind, MeetingTracks } from "@/src/lib/meetings/protocol";
import { MIC_ENCODINGS, SCREEN_ENCODINGS, cameraEncodings } from "@/src/lib/meetings/client/quality";
import { withBackoff, type MeetingMediaSession } from "@/src/lib/meetings/client/media-session";
import { diagEvent, errorText } from "@/src/lib/meetings/client/diagnostics";
import type { LocalMedia } from "./use-local-media";

const SEND_DEBOUNCE_MS = 250;
const EMPTY_TRACKS: MeetingTracks = {};

function toWire(meta: TrackMetadata) {
  return { location: "remote" as const, sessionId: meta.sessionId, trackName: meta.trackName, mid: meta.mid ?? null };
}

function withTrack(prev: MeetingTracks, kind: MeetingTrackKind, meta: TrackMetadata | null): MeetingTracks {
  if (meta) return { ...prev, [kind]: toWire(meta) };
  if (!(kind in prev)) return prev;
  return Object.fromEntries(Object.entries(prev).filter(([k]) => k !== kind)) as MeetingTracks;
}

/**
 * Pushes mic + camera (simulcast f/h/q) for the whole call, and the screen while sharing, then
 * tells the room which tracks are ours. Re-announces everything after every admitted welcome
 * (socket reconnects start from a clean slate on the room side).
 */
function pushFailed(kind: string, error: unknown, message: string) {
  diagEvent("push_failed", { kind, message: errorText(error) });
  toast.error(message);
}

export function usePublish(input: {
  session: MeetingMediaSession | null;
  media: LocalMedia;
  hand: boolean;
  send: (message: MeetingClientMessage) => boolean;
  welcomeCount: number;
}) {
  const { session, media, hand, send, welcomeCount } = input;
  // Tracks belong to one SFU session; never announce tracks from a disposed one.
  const [published, setPublished] = useState<{ session: MeetingMediaSession | null; tracks: MeetingTracks }>({
    session: null,
    tracks: {}
  });

  const setTrack = useCallback(
    (owner: MeetingMediaSession, kind: MeetingTrackKind, meta: TrackMetadata | null) =>
      setPublished((prev) =>
        prev.session === owner
          ? { session: owner, tracks: withTrack(prev.tracks, kind, meta) }
          : { session: owner, tracks: withTrack({}, kind, meta) }
      ),
    []
  );

  // Simulcast layers follow the send-quality setting and the captured height (setParameters, no renegotiation).
  const quality$ = useValueAsObservable(media.settings.sendQuality);
  const cameraEncodings$ = useMemo(
    () =>
      combineLatest([media.camera.broadcastTrack$.pipe(map((track) => track.getSettings().height ?? 0)), quality$]).pipe(
        map(([height, quality]) => cameraEncodings(quality, height)),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
      ),
    [media.camera, quality$]
  );

  useEffect(() => {
    if (!session) return;
    const { partyTracks } = session;
    const subs = [
      partyTracks
        .push(media.mic.broadcastTrack$, { sendEncodings$: of(MIC_ENCODINGS) })
        .pipe(withBackoff("push.audio"))
        .subscribe({ next: (meta) => setTrack(session, "audio", meta), error: (e) => pushFailed("audio", e, "Couldn't send your microphone.") }),
      partyTracks
        .push(media.camera.broadcastTrack$, { sendEncodings$: cameraEncodings$ })
        .pipe(withBackoff("push.video"))
        .subscribe({ next: (meta) => setTrack(session, "video", meta), error: (e) => pushFailed("video", e, "Couldn't send your camera.") })
    ];
    return () => subs.forEach((sub) => sub.unsubscribe());
  }, [session, media.mic, media.camera, cameraEncodings$, setTrack]);

  useEffect(() => {
    if (!session || !media.screen) return;
    const sub = session.partyTracks
      .push(media.screen.video.broadcastTrack$, { sendEncodings$: of(SCREEN_ENCODINGS) })
      .pipe(withBackoff("push.screen"))
      .subscribe({ next: (meta) => setTrack(session, "screen", meta), error: (e) => pushFailed("screen", e, "Couldn't share your screen.") });
    return () => {
      sub.unsubscribe();
      setTrack(session, "screen", null);
    };
  }, [session, media.screen, setTrack]);

  const tracks = published.session === session ? published.tracks : EMPTY_TRACKS;
  const screenOn = Boolean(media.screen && tracks.screen);
  const live = Boolean(session) && welcomeCount > 0;

  // Sends are coalesced (the room allows 30 messages per 5 s per socket).
  useEffect(() => {
    if (!live) return;
    const timer = setTimeout(() => send({ t: "tracks", tracks }), SEND_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [live, send, tracks, welcomeCount]);

  useEffect(() => {
    if (!live) return;
    const timer = setTimeout(
      () => send({ t: "media", audioOn: media.audioOn, videoOn: media.videoOn, screenOn }),
      SEND_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [live, send, media.audioOn, media.videoOn, screenOn, welcomeCount]);

  useEffect(() => {
    if (!live) return;
    const timer = setTimeout(() => send({ t: "hand", raised: hand }), SEND_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [live, send, hand, welcomeCount]);

  return { tracks, screenOn };
}
