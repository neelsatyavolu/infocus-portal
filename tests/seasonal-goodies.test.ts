import { describe, expect, it } from "vitest";
import { parseSeasonalGoodiesOn } from "@/src/lib/seasonal-goodies";

describe("parseSeasonalGoodiesOn", () => {
  it("is on by default", () => {
    expect(parseSeasonalGoodiesOn(null)).toBe(true);
    expect(parseSeasonalGoodiesOn(undefined)).toBe(true);
    expect(parseSeasonalGoodiesOn("")).toBe(true);
  });

  it("is off only when saved off", () => {
    expect(parseSeasonalGoodiesOn('{"off":true}')).toBe(false);
    expect(parseSeasonalGoodiesOn('{"off":false}')).toBe(true);
    expect(parseSeasonalGoodiesOn('{"off":"yes"}')).toBe(true);
  });

  it("treats bad JSON as on", () => {
    expect(parseSeasonalGoodiesOn("{nope")).toBe(true);
    expect(parseSeasonalGoodiesOn("null")).toBe(true);
  });
});
