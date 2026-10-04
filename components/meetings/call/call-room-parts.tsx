"use client";

import { useCallback } from "react";
import type { MeetingParticipantView } from "@/src/lib/meetings/protocol";
import { screenTileId } from "@/src/lib/meetings/client/layout";
import type { TileModel } from "./participant-tile";
import { useTrackLevel } from "./use-call-helpers";

/** Reports our own mic level to the speaker ring and to hand auto-lower. Renders nothing. */
export function SelfLevel({
  track,
  uid,
  onLevel,
  onSelfLevel
}: {
  track: MediaStreamTrack | undefined;
  uid: string;
  onLevel: (uid: string, level: number) => void;
  onSelfLevel: (level: number) => void;
}) {
  const report = useCallback(
    (level: number) => {
      onLevel(uid, level);
      onSelfLevel(level);
    },
    [onLevel, onSelfLevel, uid]
  );
  useTrackLevel(track, report);
  return null;
}

export function buildTiles(people: MeetingParticipantView[], selfUid: string | null, hideSelf: boolean): TileModel[] {
  const tiles: TileModel[] = [];
  for (const participant of people) {
    if (participant.isScribe) continue;
    const isSelf = participant.uid === selfUid;
    if (participant.screenOn && (isSelf || participant.tracks.screen)) {
      tiles.push({ id: screenTileId(participant.uid), participant, isSelf, isScreen: true });
    }
    if (!(isSelf && hideSelf)) tiles.push({ id: participant.uid, participant, isSelf, isScreen: false });
  }
  return tiles;
}

