import { describe, expect, it } from "vitest";
import {
  activeTags,
  applyScoreboardAction,
  clockMs,
  defaultScoreboard,
  downText,
  formatClock,
  parseScoreboard,
  periodLabel,
  pruneTags,
  scoreboardSchema,
  type ScoreboardAction,
  type ScoreboardState
} from "@/src/lib/live/scoreboard";

const T0 = 1_800_000_000_000;

function run(state: ScoreboardState, actions: ScoreboardAction[], now = T0) {
  return actions.reduce((current, action) => applyScoreboardAction(current, action, now), state);
}

describe("live scoreboard", () => {
  it("starts each sport with the right clock and markers", () => {
    expect(defaultScoreboard("basketball").clock).toMatchObject({ direction: "down", ms: 8 * 60_000 });
    expect(defaultScoreboard("football").clock.ms).toBe(12 * 60_000);
    expect(defaultScoreboard("football").possession).toBe(0);
    expect(defaultScoreboard("volleyball")).toMatchObject({ showClock: false, serve: 0 });
    expect(defaultScoreboard("other").clock).toMatchObject({ direction: "up", ms: 0 });
    expect(scoreboardSchema.safeParse(defaultScoreboard("other")).success).toBe(true);
  });

  it("never mutates the input state", () => {
    const start = defaultScoreboard("basketball");
    const copy = structuredClone(start);
    run(start, [{ type: "score", team: 0, delta: 3 }, { type: "bonus", team: 1 }, { type: "clockToggle" }]);
    expect(start).toEqual(copy);
  });

  it("clamps scores at zero", () => {
    const state = run(defaultScoreboard("basketball"), [{ type: "score", team: 1, delta: -1 }]);
    expect(state.teams[1].score).toBe(0);
  });

  it("runs the clock from server time and stops at zero", () => {
    const running = run(defaultScoreboard("basketball"), [{ type: "clockToggle" }]);
    expect(running.clock).toMatchObject({ running: true, startedAt: T0 });
    expect(clockMs(running.clock, T0 + 30_000)).toBe(8 * 60_000 - 30_000);
    expect(clockMs(running.clock, T0 + 10 * 60_000)).toBe(0);
    const stopped = applyScoreboardAction(running, { type: "clockToggle" }, T0 + 30_000);
    expect(stopped.clock).toMatchObject({ running: false, startedAt: null, ms: 8 * 60_000 - 30_000 });
  });

  it("counts up for other sports", () => {
    const running = run(defaultScoreboard("other"), [{ type: "clockToggle" }]);
    expect(clockMs(running.clock, T0 + 95_000)).toBe(95_000);
    expect(formatClock(95_400, "other")).toBe("1:35");
  });

  it("formats basketball tenths under a minute", () => {
    expect(formatClock(59_950, "basketball")).toBe("59.9");
    expect(formatClock(272_000, "basketball")).toBe("4:32");
    expect(formatClock(461_200, "football")).toBe("7:42");
  });

  it("records period totals and resets per-period state on next quarter", () => {
    const state = run(defaultScoreboard("basketball"), [
      { type: "score", team: 0, delta: 20 },
      { type: "bonus", team: 0 },
      { type: "nextPeriod" }
    ]);
    expect(state.period).toBe(2);
    expect(state.periodScores).toEqual([[20, 0]]);
    expect(state.teams[0].bonus).toBe(false);
    expect(periodLabel(state)).toBe("Q2");
    expect(periodLabel({ ...state, period: 5 })).toBe("OT");
  });

  it("shows a timeout tag for 8 seconds", () => {
    const state = run(defaultScoreboard("basketball"), [{ type: "timeout", team: 0 }]);
    expect(activeTags(state, T0 + 7_999, "timeout")[0]?.text).toBe("Timeout · PALY");
    expect(activeTags(state, T0 + 8_000, "timeout")).toHaveLength(0);
    expect(pruneTags(state, T0 + 8_000).tags).toHaveLength(0);
  });

  describe("football", () => {
    it("uses up timeouts and restores three at halftime", () => {
      let state = run(defaultScoreboard("football"), [
        { type: "timeout", team: 1 },
        { type: "timeout", team: 1 },
        { type: "timeout", team: 1 },
        { type: "timeout", team: 1 }
      ]);
      expect(state.teams[1].timeouts).toBe(0);
      state = run(state, [{ type: "nextPeriod" }, { type: "nextPeriod" }]);
      expect(state.period).toBe(3);
      expect(state.teams[1].timeouts).toBe(3);
    });

    it("sets 1st & 10 on a change of possession and clears the down after a score", () => {
      let state = run(defaultScoreboard("football"), [{ type: "possession", team: 1 }]);
      expect(downText(state, T0)).toBe("1st & 10");
      state = run(state, [{ type: "down", down: 3 }, { type: "distance", value: "goal" }]);
      expect(downText(state, T0)).toBe("3rd & GOAL");
      state = run(state, [{ type: "score", team: 1, delta: 6 }]);
      expect(state.down).toBe(0);
      expect(downText(state, T0)).toBe("");
    });

    it("turns the down tab into FLAG for 10 seconds", () => {
      const state = run(defaultScoreboard("football"), [{ type: "down", down: 2 }, { type: "flag" }]);
      expect(downText(state, T0 + 9_000)).toBe("Flag");
      expect(downText(state, T0 + 10_000)).toBe("2nd & 10");
    });
  });

  describe("volleyball", () => {
    it("moves the serve to whoever wins the rally", () => {
      const state = run(defaultScoreboard("volleyball"), [{ type: "score", team: 1, delta: 1 }]);
      expect(state.serve).toBe(1);
    });

    it("ends a set: history, sets won, scores reset, summary tag", () => {
      let state = defaultScoreboard("volleyball");
      for (let point = 0; point < 25; point += 1) state = applyScoreboardAction(state, { type: "score", team: 0, delta: 1 }, T0);
      for (let point = 0; point < 21; point += 1) state = applyScoreboardAction(state, { type: "score", team: 1, delta: 1 }, T0);
      state = applyScoreboardAction(state, { type: "endSet" }, T0);
      expect(state.set).toBe(2);
      expect(state.setHistory).toEqual([[25, 21]]);
      expect(state.teams.map((team) => [team.score, team.sets])).toEqual([[0, 1], [0, 0]]);
      expect(activeTags(state, T0, "set")[0]?.text).toBe("Set 1 · PALY 25–21");
    });
  });

  it("keeps team names and colors when switching sport", () => {
    const state = run(defaultScoreboard("basketball"), [
      { type: "team", team: 1, name: "gunn", color: "#123456" },
      { type: "score", team: 1, delta: 10 },
      { type: "sport", sport: "football" }
    ]);
    expect(state.sport).toBe("football");
    expect(state.teams[1]).toMatchObject({ name: "GUNN", color: "#123456", score: 0 });
  });

  it("resets an other-sport countdown to the last time set, not 0:00", () => {
    let state = run(defaultScoreboard("other"), [
      { type: "clockDirection", direction: "down" },
      { type: "clockSetMinutes", minutes: 40 },
      { type: "clockToggle" }
    ]);
    state = applyScoreboardAction(state, { type: "clockToggle" }, T0 + 5 * 60_000);
    expect(state.clock.ms).toBe(35 * 60_000);
    state = applyScoreboardAction(state, { type: "clockReset" }, T0 + 5 * 60_000);
    expect(state.clock.ms).toBe(40 * 60_000);
  });

  it("does not stop the clock when the current direction is tapped again", () => {
    const running = run(defaultScoreboard("other"), [{ type: "clockToggle" }]);
    expect(applyScoreboardAction(running, { type: "clockDirection", direction: "up" }, T0 + 1000)).toBe(running);
  });

  it("caps periods so every board stays valid", () => {
    let state = defaultScoreboard("basketball");
    for (let press = 0; press < 30; press += 1) state = applyScoreboardAction(state, { type: "nextPeriod" }, T0);
    expect(state.period).toBe(20);
    expect(scoreboardSchema.safeParse(state).success).toBe(true);
  });

  it("ignores invalid colors and falls back to a fresh board for bad JSON", () => {
    const state = run(defaultScoreboard(), [{ type: "team", team: 0, color: "red" }]);
    expect(state.teams[0].color).toBe("#2BB36E");
    expect(parseScoreboard({ nope: true })).toEqual(defaultScoreboard());
  });
});
