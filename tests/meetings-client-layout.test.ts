import { describe, expect, it } from "vitest";
import {
  SPEAKER_HOLD_MS,
  fitGrid,
  nextSpeakerState,
  qualityFromStats,
  resolveStage,
  selectVisibleTiles,
  type StageTile
} from "@/src/lib/meetings/client/layout";
import { INITIAL_VAD, nextVad, type VadState } from "@/src/lib/meetings/client/voice-activity";
import {
  canJoinNow,
  formatCountdown,
  formatElapsed,
  groupByPacificDay,
  isoToPacificWallTime,
  joinOpensAtMs,
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

  it("gives each mode its own arrangement with 3 tiles", () => {
    const three = [tile("me", 0, { isSelf: true }), tile("a", 1), tile("b", 2)];
    const plain = (mode: "auto" | "tiled" | "spotlight" | "sidebar") =>
      resolveStage({ mode, tiles: three, pinnedId: null, activeSpeakerUid: "b" });
    expect(plain("tiled")).toEqual({ kind: "grid", mainId: null });
    expect(plain("spotlight")).toEqual({ kind: "spotlight", mainId: "b" });
    expect(plain("sidebar")).toEqual({ kind: "sidebar", mainId: "b" });
    // Auto is the grid until someone pins or shares; then it differs from Tiled.
    expect(plain("auto")).toEqual({ kind: "grid", mainId: null });
    const sharing = [...three.slice(0, 2), tile("a", 1, { isScreen: true })];
    const share = (mode: "auto" | "tiled") => resolveStage({ mode, tiles: sharing, pinnedId: null, activeSpeakerUid: null });
    expect(share("auto")).toEqual({ kind: "sidebar", mainId: "a:screen" });
    expect(share("tiled")).toEqual({ kind: "grid", mainId: null });
  });

  it("is a plain grid for one tile", () => {
    expect(resolveStage({ mode: "spotlight", tiles: [tiles[0]], pinnedId: null, activeSpeakerUid: null }).kind).toBe("grid");
  });
});

describe("fitGrid", () => {
  const box = { width: 1600, height: 900, gap: 8, aspect: 16 / 9 };

  it("fills the box with one tile", () => {
    expect(fitGrid({ ...box, count: 1 })).toEqual({ cols: 1, rows: 1, width: 1600, height: 900 });
  });

  it("keeps 16:9 and picks the column count with the biggest tile", () => {
    const four = fitGrid({ ...box, count: 4 });
    expect([four.cols, four.rows]).toEqual([2, 2]);
    expect(Math.abs(four.width / four.height - 16 / 9)).toBeLessThan(0.01);
    expect(four.width * 2 + 8).toBeLessThanOrEqual(1600);
    expect(four.height * 2 + 8).toBeLessThanOrEqual(900);
    expect(fitGrid({ ...box, count: 5 }).cols).toBe(3);
  });

  it("respects maxCols for phones and handles empty boxes", () => {
    expect(fitGrid({ width: 390, height: 700, gap: 8, aspect: 3 / 4, count: 4, maxCols: 2 }).cols).toBeLessThanOrEqual(2);
    expect(fitGrid({ ...box, count: 3, width: 0 })).toEqual({ cols: 1, rows: 1, width: 0, height: 0 });
  });
});

describe("nextSpeakerState", () => {
  const start = { uid: null, since: 0, speaking: [] as string[] };

  it("picks the loudest voiced person and holds them through short pauses", () => {
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

  it("rings for quiet voice-isolated speech, using the same detector as hand auto-lower", () => {
    // Levels like the regression in meetings-client-hands: voiced ~0.045 between ~0.006 gaps,
    // well under the old fixed 0.06 ring threshold.
    let vad: VadState = INITIAL_VAD;
    let ringOnFor = 0;
    for (let t = 0; t <= 4000; t += 100) {
      const level = t % 350 < 200 ? 0.045 : 0.006;
      const result = nextVad(vad, t, level);
      vad = result.state;
      const state = nextSpeakerState(start, result.speaking ? { me: level } : {}, t);
      if (state.speaking.includes("me")) ringOnFor += 100;
    }
    expect(ringOnFor).toBeGreaterThan(3000);
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

  it("opens join at joinOpensAt, falling back to 5 minutes early", () => {
    const startsAt = "2026-10-05T04:15:00.000Z";
    const t = new Date(startsAt).getTime();
    expect(canJoinNow({ startsAt }, t - 6 * 60_000)).toBe(false);
    expect(canJoinNow({ startsAt }, t - 5 * 60_000)).toBe(true);
    const joinOpensAt = new Date(t - 2 * 60_000).toISOString();
    expect(joinOpensAtMs({ startsAt, joinOpensAt })).toBe(t - 2 * 60_000);
    expect(canJoinNow({ startsAt, joinOpensAt }, t - 3 * 60_000)).toBe(false);
    expect(canJoinNow({ startsAt, joinOpensAt, status: "LIVE" }, t - 60 * 60_000)).toBe(true);
    expect(joinOpensAtMs({ startsAt, joinOpensAt: "garbage" })).toBe(t - 5 * 60_000);
  });

  it("formats the countdown", () => {
    expect(formatCountdown(64_200)).toBe("1:05");
    expect(formatCountdown(-5)).toBe("0:00");
  });

  it("formats elapsed time", () => {
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(3_729_000)).toBe("1:02:09");
  });
});
