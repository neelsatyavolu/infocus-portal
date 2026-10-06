/** Pure stage layout helpers for the call UI (Google Meet style). */

export type LayoutMode = "auto" | "tiled" | "spotlight" | "sidebar";
export type StageKind = "grid" | "spotlight" | "sidebar";

export type StageTile = {
  /** `${uid}` for a camera tile, `${uid}:screen` for a screen share. */
  id: string;
  uid: string;
  isSelf: boolean;
  isScreen: boolean;
  joinedAt: number;
};

export type { SimulcastRid } from "./quality";

export const DESKTOP_MAX_TILES = 16;
export const MOBILE_MAX_TILES = 4;
export const SPEAKER_HOLD_MS = 1500;

export function screenTileId(uid: string) {
  return `${uid}:screen`;
}

/** The watch-together tile: it takes the stage like a screen share. */
export const WATCH_TILE_ID = "watch";
export const WATCH_STAGE_TILE: StageTile = { id: WATCH_TILE_ID, uid: "", isSelf: false, isScreen: true, joinedAt: -1 };

/** Decides the stage arrangement and which tile (if any) is the main one. */
export function resolveStage(input: {
  mode: LayoutMode;
  tiles: readonly StageTile[];
  pinnedId: string | null;
  activeSpeakerUid: string | null;
}): { kind: StageKind; mainId: string | null } {
  const { mode, tiles, pinnedId, activeSpeakerUid } = input;
  const ids = new Set(tiles.map((t) => t.id));
  const pinned = pinnedId && ids.has(pinnedId) ? pinnedId : null;
  const screen = tiles.find((t) => t.isScreen)?.id ?? null;
  const speaker = tiles.find((t) => !t.isScreen && !t.isSelf && t.uid === activeSpeakerUid)?.id ?? null;
  const fallback = tiles.find((t) => !t.isSelf && !t.isScreen)?.id ?? tiles[0]?.id ?? null;
  const focus = pinned ?? screen ?? speaker ?? fallback;

  if (tiles.length <= 1) return { kind: "grid", mainId: null };
  if (mode === "tiled") return pinned ? { kind: "sidebar", mainId: pinned } : { kind: "grid", mainId: null };
  if (mode === "spotlight") return { kind: "spotlight", mainId: focus };
  if (mode === "sidebar") return { kind: "sidebar", mainId: focus };
  // auto: a pin or a screen share takes the stage, otherwise everyone shares a grid.
  if (pinned || screen) return { kind: "sidebar", mainId: pinned ?? screen };
  return { kind: "grid", mainId: null };
}

/**
 * Picks the tiles to show when there are more than `max`: keeps join order (so tiles don't jump),
 * but makes sure the active speaker and screens are visible. Overflow becomes a "+N" tile.
 */
export function selectVisibleTiles(
  tiles: readonly StageTile[],
  max: number,
  activeSpeakerUid: string | null
): { visible: StageTile[]; overflow: number } {
  const ordered = [...tiles].sort(
    (a, b) => Number(b.isScreen) - Number(a.isScreen) || a.joinedAt - b.joinedAt || a.id.localeCompare(b.id)
  );
  if (ordered.length <= max) return { visible: ordered, overflow: 0 };
  const slots = Math.max(1, max - 1);
  const head = ordered.slice(0, slots);
  const speaker = ordered.find((t) => t.uid === activeSpeakerUid && !t.isScreen);
  const visible =
    speaker && !head.includes(speaker) ? [...head.slice(0, slots - 1), speaker] : head;
  return { visible, overflow: ordered.length - visible.length };
}

export type GridFit = { cols: number; rows: number; width: number; height: number };

/**
 * Equal tiles at a fixed aspect ratio, as large as fit in a `width` × `height` box with `gap`
 * between them. Tries every column count up to `maxCols` and keeps the one with the biggest
 * tile. Callers center the tiles (and so the last, shorter row) with flex-wrap + justify-center.
 */
export function fitGrid(input: {
  count: number;
  width: number;
  height: number;
  gap: number;
  aspect: number;
  maxCols?: number;
}): GridFit {
  const { count, width, height, gap, aspect } = input;
  if (count <= 0 || width <= 0 || height <= 0) return { cols: 1, rows: 1, width: 0, height: 0 };
  const maxCols = Math.max(1, Math.min(count, input.maxCols ?? count));
  let best: GridFit = { cols: 1, rows: count, width: 0, height: 0 };
  for (let cols = 1; cols <= maxCols; cols += 1) {
    const rows = Math.ceil(count / cols);
    const cellW = (width - gap * (cols - 1)) / cols;
    const cellH = (height - gap * (rows - 1)) / rows;
    if (cellW <= 0 || cellH <= 0) continue;
    const tileW = Math.min(cellW, cellH * aspect);
    if (tileW > best.width) best = { cols, rows, width: Math.floor(tileW), height: Math.floor(tileW / aspect) };
  }
  return best;
}

export type SpeakerState = { uid: string | null; since: number; speaking: readonly string[] };

/**
 * Active speaker with hysteresis. `voiced` holds the current level of each person the shared
 * detector (voice-activity.ts) says is speaking, the same decision hand auto-lower uses. The
 * loudest of them takes over only after the current speaker has been quiet for SPEAKER_HOLD_MS.
 */
export function nextSpeakerState(prev: SpeakerState, voiced: Readonly<Record<string, number>>, now: number): SpeakerState {
  const speaking = Object.entries(voiced)
    .sort((a, b) => b[1] - a[1])
    .map(([uid]) => uid);
  const sameSpeaking = speaking.length === prev.speaking.length && speaking.every((uid) => prev.speaking.includes(uid));
  const loudest = speaking[0] ?? null;
  const currentStillTalking = prev.uid !== null && speaking.includes(prev.uid);

  let uid = prev.uid;
  let since = prev.since;
  if (currentStillTalking) {
    since = now;
  } else if (loudest && (prev.uid === null || now - prev.since >= SPEAKER_HOLD_MS)) {
    uid = loudest;
    since = now;
  }
  if (uid === prev.uid && since === prev.since && sameSpeaking) return prev;
  return { uid, since, speaking: sameSpeaking ? prev.speaking : speaking };
}

export type ConnectionQuality = "good" | "fair" | "poor" | "unknown";

export function qualityFromStats(stats: { rttMs: number | null; lossRatio: number | null }): ConnectionQuality {
  const { rttMs, lossRatio } = stats;
  if (rttMs === null && lossRatio === null) return "unknown";
  const rtt = rttMs ?? 0;
  const loss = lossRatio ?? 0;
  if (rtt > 400 || loss > 0.08) return "poor";
  if (rtt > 200 || loss > 0.03) return "fair";
  return "good";
}
