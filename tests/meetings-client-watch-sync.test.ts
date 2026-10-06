import { describe, expect, it } from "vitest";
import type { MeetingWatchState } from "@/src/lib/meetings/protocol";
import { roomReducer, INITIAL_ROOM_STATE } from "@/src/lib/meetings/client/room-state";
import {
  formatWatchTime,
  watchCorrection,
  watchCountingDown,
  watchNotice,
  watchTargetPosition
} from "@/src/lib/meetings/client/watch-sync";

const watch = (extra: Partial<MeetingWatchState> = {}): MeetingWatchState => ({
  id: "w1",
  mediaId: "m1",
  versionId: "v1",
  playing: true,
  position: 10,
  at: 1_000_000,
  by: "abby",
  byName: "Abby",
  action: "play",
  ...extra
});

describe("watchTargetPosition", () => {
  it("advances while playing and holds while paused", () => {
    expect(watchTargetPosition(watch(), 1_002_500)).toBe(12.5);
    expect(watchTargetPosition(watch({ playing: false }), 1_002_500)).toBe(10);
  });

  it("holds at the start position until a start's lead runs out", () => {
    const start = watch({ position: 0, action: "start" });
    expect(watchCountingDown(start, 999_000)).toBe(true);
    expect(watchTargetPosition(start, 999_000)).toBe(0);
    expect(watchCountingDown(start, 1_000_000)).toBe(false);
  });
});

describe("watchCorrection", () => {
  const at = (current: number, extra: Partial<MeetingWatchState> = {}, duration = 120) =>
    watchCorrection({ watch: watch(extra), serverNow: 1_002_000, current, duration });

  it("leaves a device that's in step alone", () => {
    expect(at(12.05)).toEqual({ seekTo: null, play: true, playbackRate: 1 });
  });

  it("nudges the rate for small drift", () => {
    expect(at(12.5).playbackRate).toBeCloseTo(0.95);
    expect(at(11.5).playbackRate).toBeCloseTo(1.05);
  });

  it("jumps for large drift", () => {
    expect(at(20)).toEqual({ seekTo: 12, play: true, playbackRate: 1 });
    expect(at(0)).toEqual({ seekTo: 12, play: true, playbackRate: 1 });
  });

  it("matches the paused frame exactly", () => {
    expect(at(10.02, { playing: false })).toEqual({ seekTo: null, play: false, playbackRate: 1 });
    expect(at(10.3, { playing: false })).toEqual({ seekTo: 10, play: false, playbackRate: 1 });
  });

  it("stops at the end", () => {
    expect(at(30, {}, 11)).toEqual({ seekTo: 11, play: false, playbackRate: 1 });
  });

  it("plays before the duration is known", () => {
    expect(at(12, {}, Number.NaN).play).toBe(true);
  });
});

describe("watchNotice", () => {
  it("describes other people's changes", () => {
    expect(watchNotice(null, watch({ action: "start", byName: "Sage", by: "sage" }), "me")).toBe("Sage started watching together.");
    expect(watchNotice(watch(), watch({ action: "pause", position: 62, at: 2, byName: "Otto", by: "otto" }), "me")).toBe("Paused by Otto at 1:02.");
    expect(watchNotice(watch(), watch({ action: "seek", position: 75, at: 2 }), "me")).toBe("Abby jumped to 1:15.");
    expect(watchNotice(watch(), null, "me")).toBe("Watch together ended.");
  });

  it("stays quiet for our own changes and repeats", () => {
    expect(watchNotice(null, watch({ by: "me" }), "me")).toBeNull();
    expect(watchNotice(watch(), watch(), "me")).toBeNull();
    expect(watchNotice(null, null, "me")).toBeNull();
  });
});

describe("formatWatchTime", () => {
  it("formats minutes and hours", () => {
    expect(formatWatchTime(0)).toBe("0:00");
    expect(formatWatchTime(62.9)).toBe("1:02");
    expect(formatWatchTime(3605)).toBe("1:00:05");
    expect(formatWatchTime(Number.NaN)).toBe("0:00");
  });
});

describe("room reducer", () => {
  it("keeps the watch from welcome and watch messages", () => {
    const welcome = roomReducer(INITIAL_ROOM_STATE, {
      t: "welcome",
      self: { uid: "me", admitted: true, isHost: false },
      participants: [],
      waiting: [],
      settings: { quickAccess: false, notesEnabled: true },
      epoch: 0,
      watch: watch(),
      now: 5
    });
    expect(welcome.watch?.id).toBe("w1");
    expect(roomReducer(welcome, { t: "watch", watch: null, now: 6 }).watch).toBeNull();
  });

  it("treats a welcome from an older room as no watch", () => {
    const welcome = roomReducer(
      { ...INITIAL_ROOM_STATE, watch: watch() },
      { t: "welcome", self: { uid: "me", admitted: true, isHost: false }, participants: [], waiting: [], settings: { quickAccess: false, notesEnabled: true }, epoch: 0 }
    );
    expect(welcome.watch).toBeNull();
  });
});
