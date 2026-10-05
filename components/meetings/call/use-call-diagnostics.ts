"use client";

import { useEffect, useRef } from "react";
import type { PartyTracks } from "partytracks/client";
import type { MeetingClientMessage } from "@/src/lib/meetings/protocol";
import type { MeetingE2ee } from "@/src/lib/meetings/client/e2ee";
import type { RoomState } from "@/src/lib/meetings/client/room-state";
import type { RoomSocketStatus } from "@/src/lib/meetings/client/room-socket";
import {
  CallDiagnostics,
  DIAG_PERIODIC_MS,
  diagEvent,
  diagPeriodic,
  pulledTrackSource,
  setDiagSink,
  summarizeStats,
  type InboundOwner,
  type StatLike,
  type StatsCounters
} from "@/src/lib/meetings/client/diagnostics";

type Context = {
  send: (message: MeetingClientMessage) => boolean;
  partyTracks: PartyTracks | null;
  room: RoomState;
  socketStatus: RoomSocketStatus;
  e2ee: MeetingE2ee | null;
  audioOn: boolean;
  videoOn: boolean;
  voiceIsolation: boolean;
  background: string;
  audioBlocked: boolean;
};

/** Who sent a pulled track: its Realtime session and track name, matched against the room's track list. */
function ownerFromRoom(room: RoomState): InboundOwner {
  return (trackIdentifier) => {
    const source = pulledTrackSource(trackIdentifier);
    if (!source) return null;
    for (const view of Object.values(room.participants)) {
      for (const [kind, meta] of Object.entries(view.tracks)) {
        if (meta?.sessionId === source.sessionId && meta.trackName === source.trackName) return { uid: view.uid, kind };
      }
    }
    return null;
  };
}

/**
 * Debug diagnostics for the call: a getStats summary every 10 s and events on connection trouble,
 * sent to the room (Workers Logs) and kept for "Copy debug info". Reads state only; changes nothing.
 */
export function useCallDiagnostics(ctx: Context) {
  const latest = useRef(ctx);
  latest.current = ctx;
  const { send, partyTracks, socketStatus, room, e2ee } = ctx;
  // getStats runs on a timer; it reads the newest state through this ref.

  // One recorder per call; media code reports through the module sink while it's set.
  useEffect(() => {
    const diagnostics = new CallDiagnostics(send);
    setDiagSink(diagnostics);
    return () => setDiagSink(null);
  }, [send]);

  useEffect(() => {
    if (!partyTracks) return;
    let pc: RTCPeerConnection | null = null;
    let counters: StatsCounters = {};
    const onState = () => {
      if (!pc) return;
      const state = pc.connectionState;
      if (state === "failed" || state === "disconnected") {
        diagEvent("pc_state", { pc: state, ice: pc.iceConnectionState });
      }
    };
    const sub = partyTracks.peerConnection$.subscribe((next) => {
      pc?.removeEventListener("connectionstatechange", onState);
      pc = next;
      counters = {};
      pc.addEventListener("connectionstatechange", onState);
    });
    const timer = setInterval(() => {
      if (!pc) return;
      const current = pc;
      current
        .getStats()
        .then((report) => {
          const now = latest.current;
          const stats: StatLike[] = [];
          report.forEach((stat: StatLike) => stats.push(stat));
          const summary = summarizeStats(stats, counters, ownerFromRoom(now.room));
          counters = summary.counters;
          diagPeriodic({
            pc: current.connectionState,
            ice: current.iceConnectionState,
            ...summary.data,
            epoch: now.room.epoch,
            participants: Object.keys(now.room.participants).length,
            audioOn: now.audioOn,
            videoOn: now.videoOn,
            voiceIsolation: now.voiceIsolation,
            blur: now.background,
            visibility: typeof document === "undefined" ? null : document.visibilityState,
            audioBlocked: now.audioBlocked,
            decryptFailing: now.e2ee?.failingCount() ?? 0
          });
        })
        .catch(() => undefined);
    }, DIAG_PERIODIC_MS);
    return () => {
      sub.unsubscribe();
      pc?.removeEventListener("connectionstatechange", onState);
      clearInterval(timer);
    };
  }, [partyTracks]);

  // Room socket reconnects.
  const previousSocket = useRef<RoomSocketStatus>(socketStatus);
  useEffect(() => {
    const before = previousSocket.current;
    previousSocket.current = socketStatus;
    if (before !== socketStatus && (socketStatus === "reconnecting" || (before === "reconnecting" && socketStatus === "open"))) {
      diagEvent("socket", { status: socketStatus });
    }
  }, [socketStatus]);

  // Rekey (the key epoch moved on).
  const previousEpoch = useRef(room.epoch);
  useEffect(() => {
    if (room.epoch !== previousEpoch.current) diagEvent("rekey", { epoch: room.epoch, from: previousEpoch.current });
    previousEpoch.current = room.epoch;
  }, [room.epoch]);

  // Decrypt failures starting (and clearing).
  useEffect(() => {
    if (!e2ee) return;
    let failing = e2ee.failingCount();
    return e2ee.subscribe(() => {
      const next = e2ee.failingCount();
      if (next > 0 && failing === 0) diagEvent("decrypt_fail", { tracks: next, epoch: latest.current.room.epoch });
      if (next === 0 && failing > 0) diagEvent("decrypt_ok");
      failing = next;
    });
  }, [e2ee]);
}
