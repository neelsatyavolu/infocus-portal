import { describe, expect, it } from "vitest";
import {
  activeTags,
  applyScoreboardAction,
  clockMs,
  defaultScoreboard,
  downText,
  formatClock,
  parseClockInput,
  parseScoreboard,
  periodLabel,
  pruneTags,
  scoreboardSchema,
  TOUCHDOWN_MS,
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
    expect(pruneTags(state, T0 + 8_000).tags).toHaveLength(1);
    expect(pruneTags(state, T0 + 11_000).tags).toHaveLength(0);
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

    it("toggles the flag on and off", () => {
      const thrown = run(defaultScoreboard("football"), [{ type: "down", down: 2 }, { type: "flag" }]);
      expect(downText(thrown, T0 + 60_000)).toBe("Flag");
      const picked = applyScoreboardAction(thrown, { type: "flag" }, T0 + 60_000);
      expect(downText(picked, T0 + 60_000)).toBe("2nd & 10");
    });

    it("clears the flag on a new down or a score, and after two minutes if forgotten", () => {
      const thrown = run(defaultScoreboard("football"), [{ type: "down", down: 2 }, { type: "flag" }]);
      expect(downText(applyScoreboardAction(thrown, { type: "down", down: 3 }, T0), T0)).toBe("3rd & 10");
      expect(downText(applyScoreboardAction(thrown, { type: "score", team: 0, delta: 3 }, T0), T0)).toBe("");
      expect(downText(thrown, T0 + 2 * 60_000)).toBe("2nd & 10");
    });

    it("plays a touchdown on +6 for that team, and −1 cancels it", () => {
      const state = run(defaultScoreboard("football"), [
        { type: "team", team: 1, name: "Gunn" },
        { type: "score", team: 1, delta: 6 }
      ]);
      const [touchdown] = activeTags(state, T0 + 1000, "touchdown");
      expect(touchdown).toMatchObject({ text: "GUNN", team: 1 });
      expect(activeTags(state, T0 + TOUCHDOWN_MS, "touchdown")).toHaveLength(0);
      const cancelled = applyScoreboardAction(state, { type: "score", team: 1, delta: -1 }, T0 + 500);
      expect(activeTags(cancelled, T0 + 600, "touchdown")).toHaveLength(0);
      expect(cancelled.teams[1].score).toBe(5);
    });

    it("skips the touchdown when the animation is off, and only in football", () => {
      const off = run(defaultScoreboard("football"), [{ type: "celebrations", on: false }, { type: "score", team: 0, delta: 6 }]);
      expect(activeTags(off, T0, "touchdown")).toHaveLength(0);
      expect(defaultScoreboard("football", off).celebrations).toBe(false);
      const hoops = run(defaultScoreboard("basketball"), [{ type: "score", team: 0, delta: 6 }]);
      expect(activeTags(hoops, T0, "touchdown")).toHaveLength(0);
      const fieldGoal = run(defaultScoreboard("football"), [{ type: "score", team: 0, delta: 3 }]);
      expect(activeTags(fieldGoal, T0, "touchdown")).toHaveLength(0);
    });

    it("keeps boards saved before the animation setting existed", () => {
      const saved: Record<string, unknown> = { ...run(defaultScoreboard("football"), [{ type: "score", team: 0, delta: 7 }]) };
      delete saved.celebrations;
      const parsed = parseScoreboard(saved);
      expect(parsed.teams[0].score).toBe(7);
      expect(parsed.celebrations).toBe(true);
    });

    it("gives a timeout back", () => {
      const state = run(defaultScoreboard("football"), [
        { type: "timeout", team: 0 },
        { type: "timeoutAdjust", team: 0, delta: 1 },
        { type: "timeoutAdjust", team: 0, delta: 1 }
      ]);
      expect(state.teams[0].timeouts).toBe(3);
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

  it("resets an other-sport countdown to the period length, not 0:00", () => {
    let state = run(defaultScoreboard("other"), [
      { type: "clockDirection", direction: "down" },
      { type: "periodLength", minutes: 40 },
      { type: "clockToggle" }
    ]);
    expect(state.clock.ms).toBe(40 * 60_000);
    state = applyScoreboardAction(state, { type: "clockToggle" }, T0 + 5 * 60_000);
    expect(state.clock.ms).toBe(35 * 60_000);
    state = applyScoreboardAction(state, { type: "clockReset" }, T0 + 5 * 60_000);
    expect(state.clock.ms).toBe(40 * 60_000);
  });

  it("lets the operator type or nudge the clock, even while it runs", () => {
    const running = run(defaultScoreboard("basketball"), [{ type: "clockToggle" }]);
    const set = applyScoreboardAction(running, { type: "clockSet", ms: 272_000 }, T0 + 10_000);
    expect(clockMs(set.clock, T0 + 10_000)).toBe(272_000);
    expect(clockMs(set.clock, T0 + 11_000)).toBe(271_000);
    const nudged = applyScoreboardAction(set, { type: "clockAdjust", deltaMs: -10_000 }, T0 + 11_000);
    expect(clockMs(nudged.clock, T0 + 11_000)).toBe(261_000);
    const stopped = run(defaultScoreboard("football"), [{ type: "clockAdjust", deltaMs: -60 * 60_000 }]);
    expect(stopped.clock.ms).toBe(0);
  });

  it("reads typed clock values", () => {
    expect(parseClockInput("4:32")).toBe(272_000);
    expect(parseClockInput("12:00")).toBe(720_000);
    expect(parseClockInput("0:45.5")).toBe(45_500);
    expect(parseClockInput("45")).toBe(45_000);
    expect(parseClockInput("432")).toBe(272_000);
    expect(parseClockInput("4:75")).toBeNull();
    expect(parseClockInput("soon")).toBeNull();
  });

  it("sets a score directly and goes back a quarter", () => {
    let state = run(defaultScoreboard("basketball"), [
      { type: "score", team: 0, delta: 3 },
      { type: "nextPeriod" },
      { type: "scoreSet", team: 0, score: 41 }
    ]);
    expect(state.teams[0].score).toBe(41);
    state = applyScoreboardAction(state, { type: "previousPeriod" }, T0);
    expect(state.period).toBe(1);
    expect(state.periodScores).toEqual([]);
    expect(applyScoreboardAction(state, { type: "previousPeriod" }, T0).period).toBe(1);
  });

  it("allows team names up to 20 characters", () => {
    const state = run(defaultScoreboard(), [{ type: "team", team: 1, name: "Sacred Heart Cathedral Prep" }]);
    expect(state.teams[1].name).toBe("SACRED HEART CATHEDR");
    expect(scoreboardSchema.safeParse(state).success).toBe(true);
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
