"use client";

import type { PartyTracks } from "partytracks/client";
import type { MeetingE2ee } from "@/src/lib/meetings/client/e2ee";
import {
  DESKTOP_MAX_TILES,
  MOBILE_MAX_TILES,
  gridColumns,
  resolveStage,
  ridForTile,
  selectVisibleTiles,
  type LayoutMode,
  type StageTile
} from "@/src/lib/meetings/client/layout";
import { cn } from "@/src/lib/utils";
import { OverflowTile, ParticipantTile, type TileModel } from "./participant-tile";

const STRIP_MAX = 6;

export function Stage({
  tiles,
  mode,
  pinnedId,
  onPin,
  activeSpeakerUid,
  speaking,
  mobile,
  partyTracks,
  e2ee,
  selfTrack,
  onOpenPeople
}: {
  tiles: TileModel[];
  mode: LayoutMode;
  pinnedId: string | null;
  onPin: (id: string | null) => void;
  activeSpeakerUid: string | null;
  speaking: readonly string[];
  mobile: boolean;
  partyTracks: PartyTracks | null;
  e2ee: MeetingE2ee | null;
  selfTrack: MediaStreamTrack | undefined;
  onOpenPeople: () => void;
}) {
  const stageTiles: StageTile[] = tiles.map((t) => ({
    id: t.id,
    uid: t.participant.uid,
    isSelf: t.isSelf,
    isScreen: t.isScreen,
    joinedAt: t.participant.joinedAt
  }));
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const stage = resolveStage({ mode, tiles: stageTiles, pinnedId, activeSpeakerUid });

  const renderTile = (id: string, placement: "main" | "grid" | "strip", gridCount: number) => {
    const tile = byId.get(id);
    if (!tile) return null;
    return (
      <ParticipantTile
        key={id}
        tile={tile}
        partyTracks={partyTracks}
        e2ee={e2ee}
        rid={ridForTile(placement, gridCount)}
        speaking={speaking.includes(tile.participant.uid)}
        pinned={pinnedId === id}
        onTogglePin={() => onPin(pinnedId === id ? null : id)}
        selfTrack={selfTrack}
        small={placement === "strip"}
      />
    );
  };

  if (stage.kind === "grid" || !stage.mainId) {
    const max = mobile ? MOBILE_MAX_TILES : DESKTOP_MAX_TILES;
    const { visible, overflow } = selectVisibleTiles(stageTiles, max, activeSpeakerUid);
    const count = visible.length + (overflow > 0 ? 1 : 0);
    const cols = gridColumns(count, mobile);
    return (
      <div
        className="grid h-full w-full gap-2 p-2"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridAutoRows: `minmax(0, 1fr)`
        }}
      >
        {visible.map((t) => renderTile(t.id, "grid", count))}
        {overflow > 0 ? <OverflowTile count={overflow} onClick={onOpenPeople} /> : null}
      </div>
    );
  }

  const others = stageTiles.filter((t) => t.id !== stage.mainId);
  const stripMax = mobile ? MOBILE_MAX_TILES - 1 : STRIP_MAX;
  const { visible, overflow } = selectVisibleTiles(others, stripMax, activeSpeakerUid);
  const showStrip = stage.kind === "sidebar" && others.length > 0;

  return (
    <div className={cn("flex h-full w-full gap-2 p-2", mobile ? "flex-col" : "flex-row")}>
      <div className="min-h-0 min-w-0 flex-1">{renderTile(stage.mainId, "main", 1)}</div>
      {showStrip ? (
        <div
          className={cn(
            "grid shrink-0 gap-2",
            mobile ? "h-24 auto-cols-[8.5rem] grid-flow-col overflow-x-auto" : "w-56 auto-rows-[8.5rem] overflow-y-auto"
          )}
          aria-label="Other participants"
        >
          {visible.map((t) => renderTile(t.id, "strip", visible.length))}
          {overflow > 0 ? <OverflowTile count={overflow} onClick={onOpenPeople} /> : null}
        </div>
      ) : null}
    </div>
  );
}
