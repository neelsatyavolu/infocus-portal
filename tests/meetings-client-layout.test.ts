import { describe, expect, it } from "vitest";
import {
  SPEAKER_HOLD_MS,
  gridColumns,
  nextSpeakerState,
  qualityFromStats,
  resolveStage,
  ridForTile,
  selectVisibleTiles,
  type StageTile
} from "@/src/lib/meetings/client/layout";
import {
  canJoinNow,
  formatElapsed,
  groupByPacificDay,
  isoToPacificWallTime,
  pacificWallTimeToIso
} from "@/src/lib/meetings/client/time";

const tile = (uid: string, joinedAt: number, extra: Partial<StageTile> = {}): StageTile => ({
  id: extra.isScreen ? `${uid}:screen` : uid,
  uid,
  isSelf: false,
  isScreen: false,
  joinedAt,
  ...extra
});

const people = (n: number) => Array.from({ length: n }, (_, i) => tile(`u${i}`, i));

describe("selectVisibleTiles", () => {
  it("shows everyone when they fit", () => {
    expect(selectVisibleTiles(people(4), 4, null)).toEqual({ visible: people(4), overflow: 0 });
  });

  it("caps at max with a +N tile taking the last slot", () => {
    const { visible, overflow } = selectVisibleTiles(people(7), 4, null);
    expect(visible.map((t) => t.id)).toEqual(["u0", "u1", "u2"]);
    expect(overflow).toBe(4);
  });

  it("swaps the active speaker into view", () => {
    const { visible, overflow } = selectVisibleTiles(people(7), 4, "u6");
    expect(visible.map((t) => t.id)).toEqual(["u0", "u1", "u6"]);
    expect(overflow).toBe(4);
  });

  it("puts screen shares first", () => {
    const tiles = [...people(5), tile("u3", 3, { isScreen: true })];
    expect(selectVisibleTiles(tiles, 4, null).visible[0].id).toBe("u3:screen");
  });
});

describe("resolveStage", () => {
  const tiles = [tile("me", 0, { isSelf: true }), tile("a", 1), tile("b", 2)];

  it("uses a grid in auto with no pin or screen", () => {
    expect(resolveStage({ mode: "auto", tiles, pinnedId: null, activeSpeakerUid: "b" })).toEqual({ kind: "grid", mainId: null });
  });

  it("auto-spotlights a screen share and honours pins first", () => {
    const withScreen = [...tiles, tile("a", 1, { isScreen: true })];
    expect(resolveStage({ mode: "auto", tiles: withScreen, pinnedId: null, activeSpeakerUid: null })).toEqual({
      kind: "sidebar",
      mainId: "a:screen"
    });
    expect(resolveStage({ mode: "auto", tiles: withScreen, pinnedId: "b", activeSpeakerUid: null }).mainId).toBe("b");
  });

  it("spotlight follows the active speaker, never self", () => {
    expect(resolveStage({ mode: "spotlight", tiles, pinnedId: null, activeSpeakerUid: "b" }).mainId).toBe("b");
    expect(resolveStage({ mode: "spotlight", tiles, pinnedId: null, activeSpeakerUid: "me" }).mainId).toBe("a");
  });

  it("ignores a pin on a tile that left", () => {
    expect(resolveStage({ mode: "auto", tiles, pinnedId: "gone", activeSpeakerUid: null }).kind).toBe("grid");
  });

  it("is a plain grid for one tile", () => {
    expect(resolveStage({ mode: "spotlight", tiles: [tiles[0]], pinnedId: null, activeSpeakerUid: null }).kind).toBe("grid");
  });
});

describe("grid helpers", () => {
  it("picks columns", () => {
    expect([1, 2, 4, 5, 9, 12].map((n) => gridColumns(n, false))).toEqual([1, 2, 2, 3, 3, 4]);
    expect([1, 2, 3, 4].map((n) => gridColumns(n, true))).toEqual([1, 1, 2, 2]);
  });

  it("picks simulcast layers", () => {
    expect(ridForTile("main", 9)).toBe("f");
    expect(ridForTile("grid", 3)).toBe("h");
    expect(ridForTile("grid", 9)).toBe("q");
    expect(ridForTile("strip", 2)).toBe("q");
  });
});

describe("nextSpeakerState", () => {
  const start = { uid: null, since: 0, speaking: [] as string[] };

  it("picks the loudest speaker and holds them through short pauses", () => {
    const a = nextSpeakerState(start, { x: 0.2, y: 0.1 }, 1000);
    expect(a.uid).toBe("x");
    const pause = nextSpeakerState(a, { y: 0.3 }, 1500);
    expect(pause.uid).toBe("x");
    const later = nextSpeakerState(pause, { y: 0.3 }, 1000 + SPEAKER_HOLD_MS + 1);
    expect(later.uid).toBe("y");
  });

  it("returns the same object when nothing changed", () => {
    const quiet = nextSpeakerState(start, {}, 10);
    expect(quiet).toBe(start);
  });
});

describe("qualityFromStats", () => {
  it("grades connections", () => {
    expect(qualityFromStats({ rttMs: null, lossRatio: null })).toBe("unknown");
    expect(qualityFromStats({ rttMs: 50, lossRatio: 0 })).toBe("good");
    expect(qualityFromStats({ rttMs: 250, lossRatio: 0 })).toBe("fair");
    expect(qualityFromStats({ rttMs: 50, lossRatio: 0.2 })).toBe("poor");
  });
});

describe("pacific time", () => {
  it("converts wall time across DST", () => {
    expect(pacificWallTimeToIso("2026-10-04T21:15")).toBe("2026-10-05T04:15:00.000Z");
    expect(pacificWallTimeToIso("2026-12-06T21:15")).toBe("2026-12-07T05:15:00.000Z");
    expect(isoToPacificWallTime("2026-12-07T05:15:00.000Z")).toBe("2026-12-06T21:15");
    expect(pacificWallTimeToIso("not a date")).toBeNull();
  });

  it("groups by Pacific day, not UTC day", () => {
    const groups = groupByPacificDay([
      { id: "b", startsAt: "2026-10-06T04:15:00.000Z" },
      { id: "a", startsAt: "2026-10-05T17:00:00.000Z" }
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("2026-10-05");
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("opens join 10 minutes early", () => {
    const startsAt = "2026-10-05T04:15:00.000Z";
    const t = new Date(startsAt).getTime();
    expect(canJoinNow(startsAt, t - 11 * 60_000)).toBe(false);
    expect(canJoinNow(startsAt, t - 10 * 60_000)).toBe(true);
  });

  it("formats elapsed time", () => {
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(3_729_000)).toBe("1:02:09");
  });
});
