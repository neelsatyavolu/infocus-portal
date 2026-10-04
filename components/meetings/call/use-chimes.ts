"use client";

import { useEffect, useRef } from "react";
import type { RoomState } from "@/src/lib/meetings/client/room-state";
import { playChime } from "@/src/lib/meetings/client/chime-sound";
import { chimeRoster, rosterChange, shouldChime } from "@/src/lib/meetings/client/chimes";

/**
 * Soft chime when someone else joins, a lower one when someone leaves. Each admitted welcome
 * (first join or a reconnect) only sets the baseline, so the initial roster never chimes.
 */
export function useChimes(room: RoomState, welcomeCount: number, enabled: boolean, speakerId: string) {
  const baseline = useRef<ReadonlySet<string> | null>(null);
  const lastAt = useRef<number | null>(null);
  const welcomeSeen = useRef(welcomeCount);

  useEffect(() => {
    const roster = chimeRoster(Object.values(room.participants), room.selfUid);
    if (baseline.current === null || welcomeSeen.current !== welcomeCount) {
      welcomeSeen.current = welcomeCount;
      baseline.current = roster;
      return;
    }
    const change = rosterChange(baseline.current, roster);
    baseline.current = roster;
    if (!change) return;
    const now = Date.now();
    const peopleCount = roster.size + 1;
    if (!shouldChime({ enabled, peopleCount, now, lastAt: lastAt.current })) return;
    lastAt.current = now;
    void playChime(change, speakerId);
  }, [room.participants, room.selfUid, welcomeCount, enabled, speakerId]);
}
