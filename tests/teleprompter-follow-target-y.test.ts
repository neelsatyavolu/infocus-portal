import { describe, expect, it } from "vitest";
import { followTargetY } from "@/app/(app)/teleprompter/follow-target-y";

/** A stand-in for run mode's script: word i sits on visual line lines[i] (80 px per line). */
function script(lines: number[], gapAfterLine: Record<number, number> = {}) {
  const tops = lines.map((line) => line * 80 + Object.entries(gapAfterLine).reduce((sum, [after, gap]) => (line > Number(after) ? sum + gap : sum), 0));
  return {
    querySelector: (selector: string) => {
      const index = Number(selector.match(/\d+/)?.[0]);
      return index < tops.length ? { offsetTop: tops[index], offsetHeight: 80 } : null;
    }
  } as unknown as HTMLElement;
}

describe("followTargetY", () => {
  it("moves through a line a little with every word", () => {
    const content = script([0, 0, 0, 0, 1, 1, 1, 1]);
    const ys = [0, 1, 2, 3, 4].map((index) => followTargetY(content, index) ?? NaN);
    expect(ys).toEqual([...ys].sort((left, right) => left - right));
    // Four words on the line: a quarter of a line each, centered on the line's middle.
    expect(ys.slice(0, 4)).toEqual([10, 30, 50, 70]);
    expect(ys[4] - ys[3]).toBe(20);
  });

  it("moves no more than about a line toward a next line far below (cues in between)", () => {
    const content = script([0, 0, 1, 1], { 0: 400 });
    const last = followTargetY(content, 1) ?? NaN;
    expect(last - 40).toBeLessThanOrEqual(0.5 * 96);
  });

  it("returns null for a word that isn't on screen", () => {
    expect(followTargetY(script([0]), 5)).toBeNull();
  });
});
