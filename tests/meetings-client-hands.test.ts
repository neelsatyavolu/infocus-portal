import { describe, expect, it } from "vitest";
import {
  AUTO_LOWER_SPEAKING_MS,
  INITIAL_AUTO_LOWER,
  handQueue,
  nextAutoLower,
  ordinal,
  type AutoLowerState
} from "@/src/lib/meetings/client/hands";

const person = (uid: string, handRaisedAt: number | null, isScribe = false) => ({ uid, handRaisedAt, isScribe });

describe("handQueue", () => {
  it("numbers raised hands in the order they went up", () => {
    expect(handQueue([person("sage", 30), person("abby", 10), person("otto", null), person("milo", 20)])).toEqual({
      abby: 1,
      milo: 2,
      sage: 3
    });
  });

  it("ignores the scribe and breaks ties by uid", () => {
    expect(handQueue([person("b", 5), person("a", 5), person("scribe", 1, true)])).toEqual({ a: 1, b: 2 });
    expect(handQueue([])).toEqual({});
  });
});

describe("ordinal", () => {
  it("formats queue positions", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st"
    ]);
  });
});

/** Feeds samples every 150 ms (like the level meter); returns the time it lowered, or null. */
function run(levelAt: (t: number) => number, opts: { micOn?: boolean; handUp?: boolean; until?: number } = {}) {
  let state: AutoLowerState = INITIAL_AUTO_LOWER;
  for (let t = 0; t <= (opts.until ?? 10_000); t += 150) {
    const result = nextAutoLower(state, { at: t, level: levelAt(t), micOn: opts.micOn ?? true, handUp: opts.handUp ?? true });
    state = result.state;
    if (result.lower) return t;
  }
  return null;
}

describe("nextAutoLower", () => {
  it("lowers after about 2.5 s of sustained speech", () => {
    const at = run(() => 0.3);
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThanOrEqual(AUTO_LOWER_SPEAKING_MS);
    expect(at!).toBeLessThan(AUTO_LOWER_SPEAKING_MS + 300);
  });

  it("tolerates natural pauses inside the window", () => {
    // Speaks 600 ms, pauses 150 ms, repeatedly: ~80% speech.
    expect(run((t) => (t % 750 < 600 ? 0.3 : 0))).not.toBeNull();
  });

  it("ignores short blips", () => {
    // 300 ms of noise every 2 s never adds up to 2.5 s within 4 s.
    expect(run((t) => (t % 2000 < 300 ? 0.5 : 0.01))).toBeNull();
  });

  it("never lowers with the mic off or the hand down", () => {
    expect(run(() => 0.5, { micOn: false })).toBeNull();
    expect(run(() => 0.5, { handUp: false })).toBeNull();
  });

  it("forgets speech from before the hand went up", () => {
    let state: AutoLowerState = INITIAL_AUTO_LOWER;
    for (let t = 0; t <= 2000; t += 150) state = nextAutoLower(state, { at: t, level: 0.5, micOn: true, handUp: false }).state;
    expect(state.samples).toHaveLength(0);
    const next = nextAutoLower(state, { at: 2100, level: 0.5, micOn: true, handUp: true });
    expect(next.lower).toBe(false);
  });
});
