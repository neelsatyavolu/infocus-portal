import { describe, expect, it } from "vitest";
import {
  NOT_SYNCING_AFTER,
  SAVING_DELAY_MS,
  bugTags,
  downTag,
  eventContext,
  findEvent,
  formatEventOption,
  formatPushedAt,
  gameReadout,
  isDashTab,
  isPastEvent,
  queuedDiffersFromAir,
  saveView,
  scoreboardAlertTone,
  spaceTogglesClock
} from "@/app/live/live-status";
import { applyScoreboardAction, defaultScoreboard, type ScoreboardState } from "@/src/lib/live/scoreboard";
import type { LiveEventSummary } from "@/src/server/live-graphics";

const T0 = 1_800_000_000_000;

// Fri, Oct 17 2025, 7:00 PM Pacific (PDT, UTC−7).
const GAME: LiveEventSummary = {
  id: "event-1",
  title: "Varsity Boys Basketball vs. Gunn",
  startsAt: "2025-10-18T02:00:00.000Z",
  location: "Main gym"
};
const PAST: LiveEventSummary = { id: "event-0", title: "JV Football vs. Otto High", startsAt: "2025-10-10T02:00:00.000Z", location: "" };

function idle(overrides: Partial<Parameters<typeof saveView>[0]> = {}) {
  return { pending: false, pendingForMs: 0, retrying: false, failed: false, savedOnce: false, ...overrides };
}

describe("dashboard tabs", () => {
  it("accepts only the three tab names (remembered values are untrusted)", () => {
    expect(isDashTab("scoreboard")).toBe(true);
    expect(isDashTab("thumbnail")).toBe(true);
    expect(isDashTab("image")).toBe(true);
    expect(isDashTab("settings")).toBe(false);
    expect(isDashTab(null)).toBe(false);
  });
});

describe("livestream picker and header", () => {
  it("formats an option and the header context in Pacific time", () => {
    expect(formatEventOption(GAME)).toBe("Fri, Oct 17, 7:00 PM · Varsity Boys Basketball vs. Gunn");
    expect(eventContext(GAME)).toBe("Fri, Oct 17 · 7:00 PM · Main gym");
  });

  it("leaves out a blank location and a bad date", () => {
    expect(eventContext(PAST)).toBe("Thu, Oct 9 · 7:00 PM");
    expect(eventContext({ ...GAME, startsAt: "not a date", location: "  " })).toBe("");
  });

  it("finds the selected event in either list and marks past ones", () => {
    expect(findEvent("event-1", [GAME], [PAST])).toBe(GAME);
    expect(findEvent("event-0", [GAME], [PAST])).toBe(PAST);
    expect(findEvent("missing", [GAME], [PAST])).toBeNull();
    expect(findEvent(null, [GAME], [PAST])).toBeNull();
    expect(findEvent("event-0", null, [PAST])).toBe(PAST);
    expect(isPastEvent("event-0", [PAST])).toBe(true);
    expect(isPastEvent("event-1", [PAST])).toBe(false);
    expect(isPastEvent(null, [PAST])).toBe(false);
  });
});

describe("save state", () => {
  it("shows nothing until something saves, then Saved", () => {
    expect(saveView(idle())).toBe("idle");
    expect(saveView(idle({ savedOnce: true }))).toBe("saved");
  });

  it("only shows Saving once a save has waited a moment", () => {
    expect(saveView(idle({ pending: true, pendingForMs: SAVING_DELAY_MS - 1, savedOnce: true }))).toBe("saved");
    expect(saveView(idle({ pending: true, pendingForMs: SAVING_DELAY_MS }))).toBe("saving");
  });

  it("puts a waiting retry first, then a long save, then a dropped change", () => {
    expect(saveView(idle({ retrying: true, pending: true, pendingForMs: 5_000, failed: true }))).toBe("retrying");
    expect(saveView(idle({ pending: true, pendingForMs: 5_000, failed: true }))).toBe("saving");
    expect(saveView(idle({ failed: true, savedOnce: true }))).toBe("failed");
  });

  it("raises the Scoreboard alert for dropped changes, retries and lost sync only", () => {
    expect(scoreboardAlertTone("failed", false)).toBe("danger");
    expect(scoreboardAlertTone("retrying", false)).toBe("warning");
    expect(scoreboardAlertTone("saved", true)).toBe("warning");
    expect(scoreboardAlertTone("saving", false)).toBeNull();
    expect(scoreboardAlertTone("saved", false)).toBeNull();
    expect(scoreboardAlertTone("idle", false)).toBeNull();
    expect(NOT_SYNCING_AFTER).toBeGreaterThan(1);
  });
});

describe("scoreboard readouts", () => {
  it("splits the whole game into period, time and score for the phone clock bar", () => {
    const board: ScoreboardState = {
      ...defaultScoreboard("basketball"),
      teams: [
        { ...defaultScoreboard().teams[0], name: "Varsity", score: 42 },
        { ...defaultScoreboard().teams[1], name: "Gunn", score: 38 }
      ],
      period: 2
    };
    expect(gameReadout(board, T0)).toEqual({ period: "Q2", time: "8:00", score: "Varsi 42–38 Gunn" });
  });

  it("falls back to HOME and AWAY and skips an empty period label", () => {
    const base = defaultScoreboard("other");
    const board: ScoreboardState = {
      ...base,
      periodLabel: "  ",
      teams: [
        { ...base.teams[0], name: "" },
        { ...base.teams[1], name: " " }
      ]
    };
    expect(gameReadout(board, T0)).toEqual({ period: "", time: "0:00", score: "HOME 0–0 AWAY" });
  });

  it("shows the down and distance, or nothing when the down is hidden", () => {
    expect(downTag({ down: 2, distance: "7" })).toBe("2nd & 7");
    expect(downTag({ down: 4, distance: "" })).toBe("4th & 10");
    expect(downTag({ down: 1, distance: "Goal" })).toBe("1st & Goal");
    expect(downTag({ down: 0, distance: "7" })).toBeNull();
  });

  it("lists what the bug shows beyond the score, with a tone per kind", () => {
    const board = applyScoreboardAction(defaultScoreboard("basketball"), { type: "timeout", team: 0 }, T0);
    expect(bugTags(board, T0 + 1)).toEqual([expect.objectContaining({ label: "Timeout · PALY", tone: "warning" })]);
    expect(bugTags(board, T0 + 60_000)).toEqual([]);
    expect(bugTags(defaultScoreboard("football"), T0)).toEqual([]);
  });
});

describe("live image", () => {
  const onAir = { graphic: "starting-soon" as const, fields: { title: "Tip-off soon", subtitle: "", offset: "" } };

  it("flags the queued graphic as not pushed only when it is on air with other fields", () => {
    expect(queuedDiffersFromAir("starting-soon", { title: "Tip-off soon", subtitle: "", offset: "" }, onAir)).toBe(false);
    expect(queuedDiffersFromAir("starting-soon", { title: "Tip-off in 5", subtitle: "", offset: "" }, onAir)).toBe(true);
    expect(queuedDiffersFromAir("brb", {}, onAir)).toBe(false);
    expect(queuedDiffersFromAir("starting-soon", { title: "Anything" }, null)).toBe(false);
  });

  it("compares fields the way the server stores them (cut to the limit, trimmed)", () => {
    const long = "x".repeat(50);
    const stored = { ...onAir, fields: { ...onAir.fields, title: long.slice(0, 40) } };
    expect(queuedDiffersFromAir("starting-soon", { title: long, subtitle: " ", offset: "" }, stored)).toBe(false);
  });

  it("shows when it went on air in Pacific time, and nothing for a missing time", () => {
    expect(formatPushedAt(Date.parse("2025-10-18T02:42:00.000Z"))).toBe("7:42 PM");
    expect(formatPushedAt(0)).toBe("");
    expect(formatPushedAt(Number.NaN)).toBe("");
  });
});

describe("Space shortcut", () => {
  const element = (tagName: string, insideRole = false) => ({
    tagName,
    isContentEditable: false,
    closest: (selector: string) => (insideRole && selector.includes("option") ? {} : null)
  });
  const press = (target: unknown, extra: Partial<{ key: string; repeat: boolean; defaultPrevented: boolean }> = {}) =>
    spaceTogglesClock({ key: " ", repeat: false, defaultPrevented: false, target, ...extra });

  it("toggles the clock from the page itself", () => {
    expect(press(element("BODY"))).toBe(true);
    expect(press(element("DIV"))).toBe(true);
    expect(press(null)).toBe(true);
  });

  it("leaves Space to fields and buttons", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT", "BUTTON"]) expect(press(element(tag))).toBe(false);
    expect(press({ ...element("DIV"), isContentEditable: true })).toBe(false);
  });

  it("leaves Space to an open list, such as the Sport listbox", () => {
    expect(press(element("DIV", true))).toBe(false);
  });

  it("ignores Space that something already handled, held keys and other keys", () => {
    expect(press(element("DIV"), { defaultPrevented: true })).toBe(false);
    expect(press(element("DIV"), { repeat: true })).toBe(false);
    expect(press(element("DIV"), { key: "Enter" })).toBe(false);
  });
});
