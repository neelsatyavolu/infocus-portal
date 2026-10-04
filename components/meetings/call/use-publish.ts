"use client";

import { useCallback, useEffect, useState } from "react";
import { of } from "rxjs";
import { toast } from "sonner";
import type { TrackMetadata } from "partytracks/client";
import type { MeetingClientMessage, MeetingTrackKind, MeetingTracks } from "@/src/lib/meetings/protocol";
import { CAMERA_SIMULCAST } from "@/src/lib/meetings/client/layout";
import { withBackoff, type MeetingMediaSession } from "@/src/lib/meetings/client/media-session";
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

  useEffect(() => {
    if (!session) return;
    const { partyTracks } = session;
    const subs = [
      partyTracks
        .push(media.mic.broadcastTrack$)
        .pipe(withBackoff())
        .subscribe({ next: (meta) => setTrack(session, "audio", meta), error: () => toast.error("Couldn't send your microphone.") }),
      partyTracks
        .push(media.camera.broadcastTrack$, { sendEncodings$: of(CAMERA_SIMULCAST) })
        .pipe(withBackoff())
        .subscribe({ next: (meta) => setTrack(session, "video", meta), error: () => toast.error("Couldn't send your camera.") })
    ];
    return () => subs.forEach((sub) => sub.unsubscribe());
  }, [session, media.mic, media.camera, setTrack]);

  useEffect(() => {
    if (!session || !media.screen) return;
    const sub = session.partyTracks
      .push(media.screen.video.broadcastTrack$)
      .pipe(withBackoff())
      .subscribe({ next: (meta) => setTrack(session, "screen", meta), error: () => toast.error("Couldn't share your screen.") });
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
