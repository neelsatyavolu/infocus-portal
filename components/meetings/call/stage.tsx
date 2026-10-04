"use client";

import type { ReactNode } from "react";
import type { PartyTracks } from "partytracks/client";
import type { MeetingE2ee } from "@/src/lib/meetings/client/e2ee";
import {
  DESKTOP_MAX_TILES,
  MOBILE_MAX_TILES,
  fitGrid,
  resolveStage,
  selectVisibleTiles,
  type LayoutMode,
  type StageTile
} from "@/src/lib/meetings/client/layout";
import type { ReceiveQuality } from "@/src/lib/meetings/client/meet-settings";
import { cn } from "@/src/lib/utils";
import { OverflowTile, ParticipantTile, type TileModel } from "./participant-tile";
import { useElementSize } from "./use-element-size";

const STRIP_MAX = 6;
/** 8px gutters everywhere (Tailwind gap-2 / inset-2). */
const GAP = 8;

/**
 * Equal tiles at one aspect ratio, as large as fit, centered as a block; flex-wrap +
 * justify-center centers the last (shorter) row.
 */
function FittedGrid({ count, aspect, maxCols, children }: { count: number; aspect: number; maxCols?: number; children: (size: { width: number; height: number }) => ReactNode }) {
  const [ref, box] = useElementSize<HTMLDivElement>();
  const fit = fitGrid({ count, width: box.width, height: box.height, gap: GAP, aspect, maxCols });
  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="absolute inset-2" aria-hidden />
      <div className="absolute inset-2 flex flex-wrap content-center items-center justify-center gap-2">
        {fit.width > 0 ? children({ width: fit.width, height: fit.height }) : null}
      </div>
    </div>
  );
}

export function Stage({
  tiles,
  mode,
  pinnedId,
  onPin,
  activeSpeakerUid,
  speaking,
  mobile,
  landscape,
  partyTracks,
  e2ee,
  selfTrack,
  hands,
  receive,
  mirrorSelf,
  onOpenPeople
}: {
  tiles: TileModel[];
  mode: LayoutMode;
  pinnedId: string | null;
  onPin: (id: string | null) => void;
  activeSpeakerUid: string | null;
  speaking: readonly string[];
  mobile: boolean;
  landscape: boolean;
  partyTracks: PartyTracks | null;
  e2ee: MeetingE2ee | null;
  selfTrack: MediaStreamTrack | undefined;
  /** uid → raised-hand queue position. */
  hands: Readonly<Record<string, number>>;
  receive: ReceiveQuality;
  mirrorSelf: boolean;
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
  const portraitPhone = mobile && !landscape;

  // Strip tiles are fixed sizes (CSS below); their heights pick the simulcast layer.
  const stripHeight = portraitPhone ? 112 : mobile ? 90 : 135;
  const renderTile = (id: string, placement: "main" | "grid" | "strip", style?: { width: number; height: number }) => {
    const tile = byId.get(id);
    if (!tile) return null;
    return (
      <div key={id} style={style} className={cn(!style && "h-full w-full")}>
        <ParticipantTile
          tile={tile}
          partyTracks={partyTracks}
          e2ee={e2ee}
          placement={placement}
          tileHeight={style?.height ?? stripHeight}
          receive={receive}
          mirrorSelf={mirrorSelf}
          speaking={speaking.includes(tile.participant.uid)}
          handPosition={tile.isScreen ? undefined : hands[tile.participant.uid]}
          pinned={pinnedId === id}
          onTogglePin={() => onPin(pinnedId === id ? null : id)}
          selfTrack={selfTrack}
          small={placement === "strip"}
        />
      </div>
    );
  };

  if (stage.kind === "grid" || !stage.mainId) {
    const max = mobile ? MOBILE_MAX_TILES : DESKTOP_MAX_TILES;
    const { visible, overflow } = selectVisibleTiles(stageTiles, max, activeSpeakerUid);
    const count = visible.length + (overflow > 0 ? 1 : 0);
    return (
      <FittedGrid count={count} aspect={portraitPhone ? 3 / 4 : 16 / 9} maxCols={portraitPhone ? 2 : undefined}>
        {(size) => (
          <>
            {visible.map((t) => renderTile(t.id, "grid", size))}
            {overflow > 0 ? (
              <div style={size}>
                <OverflowTile count={overflow} onClick={onOpenPeople} />
              </div>
            ) : null}
          </>
        )}
      </FittedGrid>
    );
  }

  const mainId = stage.mainId;
  const others = stageTiles.filter((t) => t.id !== mainId);
  const stripMax = mobile ? MOBILE_MAX_TILES - 1 : STRIP_MAX;
  const { visible, overflow } = selectVisibleTiles(others, stripMax, activeSpeakerUid);
  const showStrip = stage.kind === "sidebar" && others.length > 0;

  return (
    <div className={cn("flex h-full w-full", portraitPhone ? "flex-col" : "flex-row")}>
      <div className="min-h-0 min-w-0 flex-1">
        <FittedGrid count={1} aspect={16 / 9}>
          {(size) => renderTile(mainId, "main", size)}
        </FittedGrid>
      </div>
      {showStrip ? (
        <div
          aria-label="Other participants"
          className={cn(
            "flex shrink-0 gap-2 overscroll-contain p-2",
            portraitPhone
              ? "h-28 flex-row overflow-x-auto pt-0"
              : cn("flex-col justify-center overflow-y-auto pl-0", mobile ? "w-40" : "w-60")
          )}
        >
          {visible.map((t) => (
            <div key={t.id} className={cn("aspect-video shrink-0", portraitPhone ? "h-full" : "w-full")}>
              {renderTile(t.id, "strip")}
            </div>
          ))}
          {overflow > 0 ? (
            <div className={cn("aspect-video shrink-0", portraitPhone ? "h-full" : "w-full")}>
              <OverflowTile count={overflow} onClick={onOpenPeople} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
