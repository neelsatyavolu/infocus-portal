import { describe, expect, it } from "vitest";
import {
  BOT_REASONS,
  CATCH_RULES,
  emptyRecent,
  FLAG_AFTER_BOT_REJECTIONS,
  FLAG_AFTER_RATE_REJECTIONS,
  flagReason,
  judgeCatches,
  RESEND_WINDOW_MS,
  type CatchInput
} from "@/src/lib/thanksgiving-guard";

const NOW = Date.parse("2026-11-04T12:00:00-08:00");

function judge(catches: CatchInput[], options: { offsetMs?: number; automation?: boolean; recent?: ReturnType<typeof emptyRecent> } = {}) {
  return judgeCatches({
    catches,
    now: NOW,
    offsetMs: options.offsetMs ?? 0,
    recent: options.recent ?? emptyRecent(),
    automation: options.automation ?? false
  });
}

const leaf = (at: number, age = 2_500): CatchInput => ({ kind: "leaves", at, age });

/** A person catching leaves at uneven moments with uneven reaction times. */
function humanPlay(count: number, start = NOW - 10 * 60_000) {
  let at = start;
  return Array.from({ length: count }, (_, i) => {
    at += 2_000 + ((i * 7_919) % 9_000);
    return leaf(at, 600 + ((i * 3_571) % 6_000));
  });
}

describe("judgeCatches", () => {
  it("accepts ordinary play", () => {
    const verdicts = judge(humanPlay(30));
    expect(verdicts.every((verdict) => verdict.accepted)).toBe(true);
  });

  it("rejects every catch from an automated browser", () => {
    expect(judge([leaf(NOW - 5_000)], { automation: true })[0]).toMatchObject({ accepted: false, reason: "automation" });
  });

  it("rejects catches made before the visitor could be seen, or with no visitor", () => {
    const [quick, none, madeUp] = judge([leaf(NOW - 9_000, 40), { kind: "pies", at: NOW - 6_000, age: null }, leaf(NOW - 3_000, 3_600_000)]);
    expect(quick.reason).toBe("inhuman-reaction");
    expect(none.reason).toBe("no-reaction-time");
    expect(madeUp.reason).toBe("no-reaction-time");
  });

  it("needs a pardon to take at least five clicks' worth of time", () => {
    expect(judge([{ kind: "pardons", at: NOW - 1_000, age: 300 }])[0].reason).toBe("inhuman-reaction");
    expect(judge([{ kind: "pardons", at: NOW - 1_000, age: 2_400 }])[0].accepted).toBe(true);
  });

  it("rejects clicks closer together than a person can click", () => {
    const verdicts = judge([leaf(NOW - 5_000, 2_500), leaf(NOW - 4_950, 3_100), leaf(NOW - 4_700, 1_900)]);
    expect(verdicts.map((verdict) => verdict.reason)).toEqual([null, "too-fast", null]);
  });

  it("marks a batch sent again (with a different clock offset) as duplicates, not bot clicks", () => {
    const batch = [leaf(NOW - 6_000, 1_857), leaf(NOW - 4_500, 2_699), leaf(NOW - 3_000, 4_377)];
    const first = judge(batch);
    expect(first.every((verdict) => verdict.accepted)).toBe(true);
    const recent = emptyRecent();
    for (const verdict of first) {
      recent.clickTimes.push(verdict.caughtAt.getTime());
      recent.kindTimes.leaves.push(verdict.caughtAt.getTime());
      recent.logged.push({ kind: "leaves", at: verdict.caughtAt.getTime(), reactionMs: verdict.reactionMs });
    }
    const again = judge(batch, { offsetMs: -750, recent });
    expect(again.map((verdict) => verdict.reason)).toEqual(["duplicate", "duplicate", "duplicate"]);
    expect(BOT_REASONS).not.toContain("duplicate");
  });

  it("still counts a different catch with the same reaction time once it's out of the re-send window", () => {
    const verdicts = judge([leaf(NOW - 20_000, 2_000), leaf(NOW - 20_000 + RESEND_WINDOW_MS + 1, 2_000)]);
    expect(verdicts.every((verdict) => verdict.accepted)).toBe(true);
  });

  it("caps each kind per minute, and counts what was already accepted", () => {
    const recent = emptyRecent();
    recent.kindTimes.pies = Array.from({ length: CATCH_RULES.pies.perMinute }, (_, i) => NOW - 50_000 + i * 1_000);
    recent.clickTimes = [...recent.kindTimes.pies];
    expect(judge([{ kind: "pies", at: NOW - 1_000, age: 1_000 }], { recent })[0].reason).toBe("rate-limit");
    expect(judge([{ kind: "pies", at: NOW - 1_000, age: 1_000 }])[0].accepted).toBe(true);
  });

  it("lets one giant turkey through a minute, without a reaction time", () => {
    const verdicts = judge([
      { kind: "giantTurkeys", at: NOW - 20_000, age: null },
      { kind: "giantTurkeys", at: NOW - 10_000, age: null }
    ]);
    expect(verdicts.map((verdict) => verdict.reason)).toEqual([null, "rate-limit"]);
  });

  it("puts browser times on the server clock and rejects impossible ones", () => {
    // The browser's clock runs five minutes slow: its times are moved forward.
    const [moved] = judge([leaf(NOW - 5 * 60_000 - 2_000)], { offsetMs: 5 * 60_000 });
    expect(moved).toMatchObject({ accepted: true, caughtAt: new Date(NOW - 2_000) });
    const [future, ancient] = judge([leaf(NOW + 60_000), leaf(NOW - 2 * 60 * 60_000)]);
    expect(future.reason).toBe("clock");
    expect(ancient.reason).toBe("clock");
  });

  it("judges catches in the order they happened", () => {
    const verdicts = judge([leaf(NOW - 1_000), leaf(NOW - 5_000)]);
    expect(verdicts.map((verdict) => verdict.caughtAt.getTime())).toEqual([NOW - 5_000, NOW - 1_000]);
  });
});

describe("flagReason", () => {
  const human = humanPlay(40).map((entry) => entry.at);
  const humanReactions = humanPlay(40).map((entry) => entry.age ?? 0);

  it("leaves a person alone", () => {
    expect(flagReason({ botRejections: 2, rateRejections: 5, clickTimes: human, reactions: humanReactions })).toBeNull();
  });

  it("flags repeated bot-like or over-the-limit catches", () => {
    expect(flagReason({ botRejections: FLAG_AFTER_BOT_REJECTIONS, rateRejections: 0, clickTimes: [], reactions: [] })).toMatch(/no person/);
    expect(flagReason({ botRejections: 0, rateRejections: FLAG_AFTER_RATE_REJECTIONS, clickTimes: [], reactions: [] })).toMatch(/rate limits/);
  });

  it("flags clicks spaced like clockwork", () => {
    const clockwork = Array.from({ length: 40 }, (_, i) => NOW + i * 1_500 + (i % 2) * 20);
    expect(flagReason({ botRejections: 0, rateRejections: 0, clickTimes: clockwork, reactions: humanReactions })).toMatch(/evenly spaced/);
  });

  it("flags the same reaction time every time", () => {
    const same = Array.from({ length: 40 }, (_, i) => 500 + (i % 3));
    expect(flagReason({ botRejections: 0, rateRejections: 0, clickTimes: human, reactions: same })).toMatch(/Reaction times/);
  });

  it("flags catching every leaf the moment it appears (an autoclicker watching the top edge)", () => {
    // The pattern seen in production: 47 leaves, each caught 0.6–1.0 s after it appeared.
    const sniped = Array.from({ length: 40 }, (_, i) => 600 + ((i * 97) % 430));
    expect(flagReason({ botRejections: 0, rateRejections: 0, clickTimes: human, reactions: humanReactions, leafReactions: sniped })).toMatch(
      /moment it appeared/
    );
    // A quick person still catches plenty of leaves partway down.
    const quickHuman = Array.from({ length: 40 }, (_, i) => (i % 3 === 0 ? 900 + i * 10 : 2_000 + ((i * 733) % 9_000)));
    expect(flagReason({ botRejections: 0, rateRejections: 0, clickTimes: human, reactions: quickHuman, leafReactions: quickHuman })).toBeNull();
  });

  it("ignores long breaks when judging rhythm", () => {
    // Even gaps only because of 40-second breaks between catches: not play, so not judged.
    const breaks = Array.from({ length: 40 }, (_, i) => NOW + i * 40_000);
    expect(flagReason({ botRejections: 0, rateRejections: 0, clickTimes: breaks, reactions: humanReactions })).toBeNull();
  });
});
