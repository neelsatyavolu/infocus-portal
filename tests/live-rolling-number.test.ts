import { describe, expect, it } from "vitest";
import { planRoll } from "@/components/live/rolling-number";

// Cells: 0 blank, 1–10 digits 0–9, 11–20 digits 0–9 again.
describe("score reel rolls", () => {
  it("rolls up to a higher digit", () => {
    expect(planRoll(4, 5, 1)).toEqual({ from: 4, target: 6 });
  });

  it("wraps 9 → 0 forward like an odometer", () => {
    expect(planRoll(10, 0, 1)).toEqual({ from: 10, target: 11 });
  });

  it("rolls down for a correction, wrapping 0 → 9 backward", () => {
    expect(planRoll(6, 3, -1)).toEqual({ from: 6, target: 4 });
    expect(planRoll(1, 9, -1)).toEqual({ from: 11, target: 10 });
  });

  it("continues from mid-roll instead of jumping back", () => {
    expect(planRoll(10.4, 1, 1)).toEqual({ from: 10.4, target: 12 });
    expect(planRoll(11.6, 3, 1).from).toBeCloseTo(1.6);
    expect(planRoll(11.6, 3, 1).target).toBe(4);
  });

  it("rolls a new leading digit in from blank", () => {
    expect(planRoll(0, 1, 1)).toEqual({ from: 0, target: 2 });
  });
});
